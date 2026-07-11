import http from 'http';
import https from 'https';

/**
 * Validates that the system is completely offline by attempting an external network request.
 * If the request succeeds, it means the network namespaces / iptables rules are NOT active,
 * and we must refuse to boot.
 */
export async function verifyOfflineGuard(): Promise<boolean> {
  if (process.env.WARDEN_OFFLINE_BYPASS === 'true') {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[Network Guard] 🚨 WARDEN_OFFLINE_BYPASS is strictly forbidden in production mode. Refusing to boot. 🚨',
      );
      return false;
    }
    console.log('[Network Guard] BYPASSED via WARDEN_OFFLINE_BYPASS. Assuming offline.');
    return true;
  }

  console.log('[Network Guard] Verifying offline guarantee...');

  // We ping a reliable public IP/DNS to check for internet access
  const checkUrl = 'http://1.1.1.1';

  return new Promise((resolve, reject) => {
    const req = http.get(checkUrl, { timeout: 3000 }, (res) => {
      // If we get any response, we are online. Guard failed.
      console.error('[Network Guard] 🚨 NETWORK BREACH DETECTED 🚨');
      console.error(
        '[Network Guard] External network request succeeded. Offline guarantee is NOT enforced.',
      );
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      console.log('[Network Guard] Request timed out. Offline enforced.');
      resolve(true);
    });

    req.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENETUNREACH' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        console.log('[Network Guard] Connection failed as expected. Offline enforced.');
        resolve(true);
      } else {
        console.log(`[Network Guard] Connection failed with ${err.code}. Assuming offline.`);
        resolve(true);
      }
    });
  });
}
