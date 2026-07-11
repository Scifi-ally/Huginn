const fs = require('fs');
const content = fs.readFileSync('ui/src/index.css', 'utf8');
const lines = content.split('\n');
const goodLines = lines.slice(0, 617);
goodLines.push(`
@keyframes wavy-glow-red {
  0%, 100% {
    box-shadow: 0 0 15px 0px rgba(239, 68, 68, 0.2), inset 0 0 5px 0px rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
  }
  50% {
    box-shadow: 0 0 35px 5px rgba(239, 68, 68, 0.4), inset 0 0 15px 0px rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.6);
  }
}
@keyframes wavy-glow-blue {
  0%, 100% {
    box-shadow: 0 0 15px 0px rgba(59, 130, 246, 0.2), inset 0 0 5px 0px rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.3);
  }
  50% {
    box-shadow: 0 0 35px 5px rgba(59, 130, 246, 0.4), inset 0 0 15px 0px rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.6);
  }
}
.glow-red {
  animation: wavy-glow-red 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  border-width: 1px;
  border-style: solid;
}
.glow-blue {
  animation: wavy-glow-blue 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  border-width: 1px;
  border-style: solid;
}
`);
fs.writeFileSync('ui/src/index.css', goodLines.join('\n'));
console.log('Fixed CSS');
