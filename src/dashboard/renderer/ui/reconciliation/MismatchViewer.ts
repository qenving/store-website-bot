export class MismatchViewer {
  private container: HTMLElement;
  private mismatches: any[] = [];
  private filter: {
    resolved: boolean;
    type?: string;
    severity?: string;
    provider?: string;
  } = { resolved: false };

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.container = container;
  }

  async initialize(): Promise<void> {
    await this.loadMismatches();
    this.render();
  }

  private async loadMismatches(): Promise<void> {
    try {
      const response = await fetch(
        `http://localhost:3001/api/reconciliation/mismatches?resolved=${this.filter.resolved}&limit=100`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
          }
        }
      );

      const result = await response.json();
      if (result.success) {
        this.mismatches = result.data;
      }
    } catch (error) {
      console.error('Failed to load mismatches', error);
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="mismatch-viewer">
        <div class="viewer-header">
          <h2>Mismatch Viewer</h2>
          <div class="filter-controls">
            <label>
              <input type="checkbox" id="show-resolved" ${this.filter.resolved ? 'checked' : ''}>
              Show Resolved
            </label>
            <button id="refresh-btn" class="btn btn-sm">Refresh</button>
          </div>
        </div>

        <div class="mismatch-stats">
          <p><strong>Total:</strong> ${this.mismatches.length}</p>
        </div>

        <div class="mismatch-list">
          ${this.renderMismatchList()}
        </div>
      </div>
    `;

    // Attach event listeners
    this.attachListeners();
  }

  private renderMismatchList(): string {
    if (this.mismatches.length === 0) {
      return '<p>No mismatches found</p>';
    }

    const filtered = this.applyFilters();

    return `
      <table class="mismatch-table">
        <thead>
          <tr>
            <th>Detected</th>
            <th>Type</th>
            <th>Severity</th>
            <th>Transaction ID</th>
            <th>Order ID</th>
            <th>Provider</th>
            <th>Local Status</th>
            <th>Provider Status</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(m => this.renderMismatchRow(m)).join('')}
        </tbody>
      </table>
    `;
  }

  private renderMismatchRow(mismatch: any): string {
    const detectedTime = new Date(mismatch.detectedAt).toLocaleString();
    const isResolved = mismatch.resolved;

    return `
      <tr class="mismatch-row ${isResolved ? 'resolved' : ''}" data-id="${mismatch.id}">
        <td>${detectedTime}</td>
        <td><span class="badge badge-type">${mismatch.type}</span></td>
        <td><span class="badge badge-${mismatch.severity}">${mismatch.severity}</span></td>
        <td><code>${mismatch.transactionId.substring(0, 12)}...</code></td>
        <td><code>${mismatch.orderId}</code></td>
        <td>${mismatch.provider}</td>
        <td><span class="status-badge">${mismatch.localStatus}</span></td>
        <td><span class="status-badge">${mismatch.providerStatus || 'N/A'}</span></td>
        <td>${mismatch.localAmount} ${mismatch.currency}</td>
        <td>
          ${isResolved ? `
            <span class="badge badge-success">Resolved</span>
            <br><small>By: ${mismatch.resolvedBy}</small>
            <br><small>${new Date(mismatch.resolvedAt).toLocaleString()}</small>
          ` : `
            <span class="badge badge-warning">Unresolved</span>
          `}
        </td>
        <td>
          <button class="btn btn-sm view-details-btn" data-id="${mismatch.id}">View</button>
          ${!isResolved ? `
            <button class="btn btn-sm btn-primary resolve-btn" data-id="${mismatch.id}">Resolve</button>
          ` : ''}
        </td>
      </tr>
    `;
  }

  private applyFilters(): any[] {
    let filtered = [...this.mismatches];

    if (this.filter.type) {
      filtered = filtered.filter(m => m.type === this.filter.type);
    }

    if (this.filter.severity) {
      filtered = filtered.filter(m => m.severity === this.filter.severity);
    }

    if (this.filter.provider) {
      filtered = filtered.filter(m => m.provider === this.filter.provider);
    }

    return filtered;
  }

  private attachListeners(): void {
    // Show resolved checkbox
    const showResolvedCheckbox = document.getElementById('show-resolved') as HTMLInputElement;
    if (showResolvedCheckbox) {
      showResolvedCheckbox.addEventListener('change', async (e) => {
        this.filter.resolved = (e.target as HTMLInputElement).checked;
        await this.loadMismatches();
        this.render();
      });
    }

    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        await this.loadMismatches();
        this.render();
      });
    }

    // View details buttons
    document.querySelectorAll('.view-details-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.target as HTMLElement).getAttribute('data-id');
        if (id) {
          this.viewMismatchDetails(id);
        }
      });
    });

    // Resolve buttons
    document.querySelectorAll('.resolve-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = (e.target as HTMLElement).getAttribute('data-id');
        if (id) {
          this.openResolveDialog(id);
        }
      });
    });
  }

  private viewMismatchDetails(id: string): void {
    const mismatch = this.mismatches.find(m => m.id === id);
    if (!mismatch) return;

    const detailsHtml = `
      <div class="mismatch-details-modal">
        <h3>Mismatch Details</h3>

        <div class="details-grid">
          <div class="detail-item">
            <label>ID:</label>
            <span>${mismatch.id}</span>
          </div>
          <div class="detail-item">
            <label>Type:</label>
            <span class="badge badge-type">${mismatch.type}</span>
          </div>
          <div class="detail-item">
            <label>Severity:</label>
            <span class="badge badge-${mismatch.severity}">${mismatch.severity}</span>
          </div>
          <div class="detail-item">
            <label>Transaction ID:</label>
            <span><code>${mismatch.transactionId}</code></span>
          </div>
          <div class="detail-item">
            <label>Order ID:</label>
            <span><code>${mismatch.orderId}</code></span>
          </div>
          <div class="detail-item">
            <label>Provider:</label>
            <span>${mismatch.provider}</span>
          </div>
          <div class="detail-item">
            <label>Local Status:</label>
            <span>${mismatch.localStatus}</span>
          </div>
          <div class="detail-item">
            <label>Provider Status:</label>
            <span>${mismatch.providerStatus || 'N/A'}</span>
          </div>
          <div class="detail-item">
            <label>Local Amount:</label>
            <span>${mismatch.localAmount} ${mismatch.currency}</span>
          </div>
          <div class="detail-item">
            <label>Provider Amount:</label>
            <span>${mismatch.providerAmount || 'N/A'} ${mismatch.currency}</span>
          </div>
          <div class="detail-item">
            <label>Detected At:</label>
            <span>${new Date(mismatch.detectedAt).toLocaleString()}</span>
          </div>
        </div>

        <div class="recommended-action-box">
          <h4>Recommended Action</h4>
          <p>${mismatch.recommendedAction}</p>
        </div>

        ${mismatch.resolved ? `
          <div class="resolution-details">
            <h4>Resolution</h4>
            <p><strong>Resolved By:</strong> ${mismatch.resolvedBy}</p>
            <p><strong>Resolved At:</strong> ${new Date(mismatch.resolvedAt).toLocaleString()}</p>
            ${mismatch.resolverNotes ? `<p><strong>Notes:</strong> ${mismatch.resolverNotes}</p>` : ''}
          </div>
        ` : ''}

        ${mismatch.metadata ? `
          <div class="metadata">
            <h4>Metadata</h4>
            <pre>${JSON.stringify(mismatch.metadata, null, 2)}</pre>
          </div>
        ` : ''}

        <button class="btn close-modal-btn">Close</button>
      </div>
    `;

    // Show modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = detailsHtml;
    document.body.appendChild(modal);

    // Close modal button
    modal.querySelector('.close-modal-btn')?.addEventListener('click', () => {
      modal.remove();
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  private openResolveDialog(id: string): void {
    const mismatch = this.mismatches.find(m => m.id === id);
    if (!mismatch) return;

    // This would open the ResolverPanel
    // For now, just emit an event
    const event = new CustomEvent('open-resolver', { detail: { mismatchId: id } });
    document.dispatchEvent(event);
  }
}
