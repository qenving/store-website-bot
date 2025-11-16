export class ApiKeysPanel {
  async getMaskedSecrets() {
    const result = await (window as any).electron.security.getMaskedSecrets();
    return result.success ? result.data : [];
  }

  async rotateKey(keyType: string, data: any) {
    const result = await (window as any).electron.security.rotateKey(keyType, data);
    return result.success;
  }
}
