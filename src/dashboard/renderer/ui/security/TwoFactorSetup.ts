export class TwoFactorSetup {
  async setup(userId: string) {
    const result = await (window as any).electron.security.setupTOTP(userId);
    if (result.success) {
      return result.data;
    }
    throw new Error(result.error);
  }

  async enable(userId: string, secret: string, token: string, backupCodes: string[]) {
    const response = await fetch('/api/security/totp/enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, token, backupCodes })
    });
    return response.json();
  }
}
