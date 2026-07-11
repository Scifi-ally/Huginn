import ts from 'typescript';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';

const execAsync = util.promisify(exec);

export async function skeletonizeFile(filePath: string, content: string): Promise<string> {
  const ext = filePath.split('.').pop()?.toLowerCase();

  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
    return skeletonizeTs(filePath, content);
  } else if (ext === 'py') {
    return skeletonizePy(content);
  }

  return 'Error: AST Skeletonizer currently only supports JS/TS and Python.';
}

function skeletonizeTs(filePath: string, content: string): string {
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

  let skeleton = '';

  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node)) {
      const name = node.name?.getText() || 'AnonymousClass';
      skeleton += `class ${name} {\n`;
      node.members.forEach((member) => {
        if (
          ts.isMethodDeclaration(member) ||
          ts.isPropertyDeclaration(member) ||
          ts.isConstructorDeclaration(member)
        ) {
          // Get only the signature line
          const memberText = member.getText().split('{')[0].trim();
          skeleton += `  ${memberText};\n`;
        }
      });
      skeleton += `}\n\n`;
    } else if (ts.isFunctionDeclaration(node)) {
      const funcText = node.getText().split('{')[0].trim();
      skeleton += `${funcText};\n\n`;
    } else if (ts.isVariableStatement(node)) {
      // Only care about top-level exported or significant variables (like React components)
      if (
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ||
        node.declarationList.declarations.some(
          (d) =>
            d.initializer &&
            (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)),
        )
      ) {
        const decl = node.getText().split(/=|{/)[0].trim();
        skeleton += `${decl} = ...;\n\n`;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return skeleton.trim() || 'No classes or functions found.';
}

async function skeletonizePy(content: string): Promise<string> {
  const pyScript = `
import ast
import sys

code = sys.stdin.read()
try:
    tree = ast.parse(code)
    for node in tree.body:
        if isinstance(node, ast.ClassDef):
            print(f"class {node.name}:")
            for item in node.body:
                if isinstance(item, ast.FunctionDef):
                    print(f"    def {item.name}(...): pass")
            print("")
        elif isinstance(node, ast.FunctionDef):
            print(f"def {node.name}(...): pass\\n")
except Exception as e:
    print(f"AST Parse Error: {e}")
`;

  const tmp = `_tmp_ast_${Date.now()}.py`;
  await fs.writeFile(tmp, pyScript);
  try {
    const child = exec(`python ${tmp}`);
    let out = '';
    child.stdout?.on('data', (d) => (out += d));
    child.stdin?.write(content);
    child.stdin?.end();
    await new Promise((r) => child.on('close', r));
    await fs.unlink(tmp);
    return out.trim();
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    return 'Python AST parse failed.';
  }
}

export async function getFunctionRange(
  filePath: string,
  content: string,
  functionName: string,
): Promise<{ start: number; end: number } | null> {
  const ext = filePath.split('.').pop()?.toLowerCase();

  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
    return getFunctionRangeTs(filePath, content, functionName);
  } else if (ext === 'py') {
    return getFunctionRangePy(content, functionName);
  }

  return null;
}

function getFunctionRangeTs(
  filePath: string,
  content: string,
  functionName: string,
): { start: number; end: number } | null {
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

  let range: { start: number; end: number } | null = null;

  const isMethod = functionName.includes('.');
  const targetClass = isMethod ? functionName.split('.')[0] : null;
  const targetFunc = isMethod ? functionName.split('.')[1] : functionName;

  function visit(node: ts.Node) {
    if (range) return;

    if (isMethod && ts.isClassDeclaration(node) && node.name?.getText() === targetClass) {
      node.members.forEach((member) => {
        if (
          (ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) &&
          member.name?.getText() === targetFunc
        ) {
          const startLine = sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1;
          const endLine = sourceFile.getLineAndCharacterOfPosition(member.getEnd()).line + 1;
          range = { start: startLine, end: endLine };
        }
      });
    } else if (!isMethod && ts.isFunctionDeclaration(node) && node.name?.getText() === targetFunc) {
      const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
      range = { start: startLine, end: endLine };
    } else if (!isMethod && ts.isVariableDeclaration(node) && node.name?.getText() === targetFunc) {
      if (
        node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      ) {
        let parent: ts.Node | undefined = node.parent;
        while (parent && !ts.isVariableStatement(parent)) {
          parent = parent.parent;
        }
        if (parent) {
          const startLine = sourceFile.getLineAndCharacterOfPosition(parent.getStart()).line + 1;
          const endLine = sourceFile.getLineAndCharacterOfPosition(parent.getEnd()).line + 1;
          range = { start: startLine, end: endLine };
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return range;
}

async function getFunctionRangePy(
  content: string,
  functionName: string,
): Promise<{ start: number; end: number } | null> {
  const pyScript = `
import ast
import sys

code = sys.stdin.read()
target = "${functionName}"

is_method = "." in target
target_class = target.split(".")[0] if is_method else None
target_func = target.split(".")[1] if is_method else target

try:
    tree = ast.parse(code)
    for node in tree.body:
        if is_method and isinstance(node, ast.ClassDef) and node.name == target_class:
            for item in node.body:
                if isinstance(item, ast.FunctionDef) and item.name == target_func:
                    print(f"{item.lineno},{item.end_lineno}")
                    sys.exit(0)
        elif not is_method and isinstance(node, ast.FunctionDef) and node.name == target_func:
            print(f"{node.lineno},{node.end_lineno}")
            sys.exit(0)
except Exception:
    pass
`;

  const tmp = `_tmp_ast_${Date.now()}.py`;
  await fs.writeFile(tmp, pyScript);
  try {
    const child = exec(`python ${tmp}`);
    let out = '';
    child.stdout?.on('data', (d) => (out += d));
    child.stdin?.write(content);
    child.stdin?.end();
    await new Promise((r) => child.on('close', r));
    await fs.unlink(tmp);

    const res = out.trim();
    if (res && res.includes(',')) {
      const [start, end] = res.split(',').map(Number);
      return { start, end };
    }
    return null;
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    return null;
  }
}
