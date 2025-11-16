export class SecurityLogsViewer {
  async getLogs(filters: any = {}) {
    const result = await (window as any).electron.security.getSecurityLogs(filters);
    return result.success ? result.data : [];
  }
}
