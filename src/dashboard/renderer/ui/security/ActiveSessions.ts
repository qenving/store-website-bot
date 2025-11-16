export class ActiveSessions {
  async getSessions() {
    const result = await (window as any).electron.security.getActiveSessions();
    return result.success ? result.data : [];
  }

  async revokeSession(sessionId: string) {
    const result = await (window as any).electron.security.revokeSession(sessionId);
    return result.success;
  }
}
