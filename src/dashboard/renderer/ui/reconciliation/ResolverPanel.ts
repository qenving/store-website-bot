export class ResolverPanel {
  private container: HTMLElement;
  private currentMismatch: any = null;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.container = container;
  }

  async initialize(): Promise<void> {
    // Listen for open-resolver events
    document.addEventListener('open-resolver', (e: any) => {
      const mismatchId = e.detail?.mismatchId;
      if (mismatchId) {
        this.openForMismatch(mismatchId);
      }
    });

    this.render();
  }

  private async openForMismatch(mismatchId: string): Promise<void> {
    try {
      const response = await fetch(
        `http://localhost:3001/api/reconciliation/mismatches/${mismatchId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
          }
        }
      );

      const result = await response.json();
      if (result.success) {
        this.currentMismatch = result.data;
        this.showPanel();
      }
    } catch (error) {
      console.error('Failed to load mismatch', error);
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="resolver-panel" id="resolver-panel" style="display: none;">
        <div class="panel-header">
          <h3>Resolve Mismatch</h3>
          <button class="close-panel-btn" id="close-panel-btn">&times;</button>
        </div>
        <div class="panel-content" id="panel-content"></div>
      </div>
    `;

    // Attach close listener
    const closeBtn = document.getElementById('close-panel-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hidePanel());
    }
  }

  private showPanel(): void {
    const panel = document.getElementById('resolver-panel');
    if (!panel) return;

    panel.style.display = 'block';
    this.renderContent();
  }

  private hidePanel(): void {
    const panel = document.getElementById('resolver-panel');
    if (panel) {
      panel.style.display = 'none';
    }
    this.currentMismatch = null;
  }

  private renderContent(): void {
    const content = document.getElementById('panel-content');
    if (!content || !this.currentMismatch) return;

    const m = this.currentMismatch;

    content.innerHTML = `
      <div class="mismatch-summary">
        <h4>Mismatch Summary</h4>
        <div class="summary-grid">
          <div class="summary-item">
            <label>Type:</label>
            <span class="badge badge-type">${m.type}</span>
          </div>
          <div class="summary-item">
            <label>Severity:</label>
            <span class="badge badge-${m.severity}">${m.severity}</span>
          </div>
          <div class="summary-item">
            <label>Transaction ID:</label>
            <span><code>${m.transactionId}</code></span>
          </div>
          <div class="summary-item">
            <label>Provider:</label>
            <span>${m.provider}</span>
          </div>
          <div class="summary-item">
            <label>Local Status:</label>
            <span>${m.localStatus}</span>
          </div>
          <div class="summary-item">
            <label>Provider Status:</label>
            <span>${m.providerStatus || 'N/A'}</span>
          </div>
        </div>

        <div class="recommended-action">
          <h5>Recommended Action</h5>
          <p class="action-text">${m.recommendedAction}</p>
        </div>
      </div>

      <div class="resolution-form">
        <h4>Resolution Action</h4>

        <div class="form-group">
          <label for="action-select">Select Action:</label>
          <select id="action-select" class="form-control">
            <option value="">-- Select Action --</option>
            <option value="sync_from_provider">Sync from Provider</option>
            <option value="force_local_status">Force Local Status</option>
            <option value="mark_as_valid">Mark as Valid (No Action)</option>
            <option value="manual_review">Flag for Manual Review</option>
            <option value="refund">Process Refund</option>
            <option value="cancel">Cancel Transaction</option>
          </select>
        </div>

        <div class="action-descriptions" id="action-descriptions">
          ${this.renderActionDescriptions()}
        </div>

        <div class="form-group">
          <label for="resolver-notes">Notes (Optional):</label>
          <textarea
            id="resolver-notes"
            class="form-control"
            rows="4"
            placeholder="Add notes about this resolution..."
          ></textarea>
        </div>

        <div class="form-actions">
          <button id="resolve-btn" class="btn btn-primary" disabled>Resolve Mismatch</button>
          <button id="cancel-btn" class="btn btn-secondary">Cancel</button>
        </div>
      </div>

      <div class="resolution-result" id="resolution-result" style="display: none;"></div>
    `;

    // Attach form listeners
    this.attachFormListeners();
  }

  private renderActionDescriptions(): string {
    return `
      <div class="action-desc" data-action="sync_from_provider">
        <strong>Sync from Provider:</strong> Update local transaction status to match the provider's status.
        Use this when the provider is the source of truth.
      </div>
      <div class="action-desc" data-action="force_local_status">
        <strong>Force Local Status:</strong> Keep the local status as-is and mark the mismatch as resolved.
        Use when you've verified the local status is correct.
      </div>
      <div class="action-desc" data-action="mark_as_valid">
        <strong>Mark as Valid:</strong> Accept the mismatch as explainable/acceptable without changing anything.
        Use for known edge cases.
      </div>
      <div class="action-desc" data-action="manual_review">
        <strong>Flag for Manual Review:</strong> Mark transaction for later investigation.
        Use when you need more information before deciding.
      </div>
      <div class="action-desc" data-action="refund">
        <strong>Process Refund:</strong> Refund the transaction amount to the user's balance.
        Use when payment succeeded but shouldn't have.
      </div>
      <div class="action-desc" data-action="cancel">
        <strong>Cancel Transaction:</strong> Mark the transaction as cancelled.
        Use when the transaction should not have been created.
      </div>
    `;
  }

  private attachFormListeners(): void {
    const actionSelect = document.getElementById('action-select') as HTMLSelectElement;
    const resolveBtn = document.getElementById('resolve-btn') as HTMLButtonElement;
    const cancelBtn = document.getElementById('cancel-btn');

    // Action select change
    if (actionSelect) {
      actionSelect.addEventListener('change', (e) => {
        const selectedAction = (e.target as HTMLSelectElement).value;

        // Enable/disable resolve button
        if (resolveBtn) {
          resolveBtn.disabled = !selectedAction;
        }

        // Highlight corresponding description
        document.querySelectorAll('.action-desc').forEach(desc => {
          desc.classList.remove('active');
        });

        if (selectedAction) {
          const activeDesc = document.querySelector(`.action-desc[data-action="${selectedAction}"]`);
          if (activeDesc) {
            activeDesc.classList.add('active');
          }
        }
      });
    }

    // Resolve button
    if (resolveBtn) {
      resolveBtn.addEventListener('click', async () => {
        const action = actionSelect?.value;
        const notes = (document.getElementById('resolver-notes') as HTMLTextAreaElement)?.value;

        if (!action) {
          alert('Please select an action');
          return;
        }

        await this.resolveMismatch(action, notes);
      });
    }

    // Cancel button
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.hidePanel();
      });
    }
  }

  private async resolveMismatch(action: string, notes: string): Promise<void> {
    if (!this.currentMismatch) return;

    const resolveBtn = document.getElementById('resolve-btn') as HTMLButtonElement;
    if (resolveBtn) {
      resolveBtn.disabled = true;
      resolveBtn.textContent = 'Resolving...';
    }

    try {
      const response = await fetch(
        `http://localhost:3001/api/reconciliation/mismatches/${this.currentMismatch.id}/resolve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
          },
          body: JSON.stringify({
            action,
            adminId: localStorage.getItem('adminId'),
            adminUsername: localStorage.getItem('adminUsername'),
            notes
          })
        }
      );

      const result = await response.json();

      const resultDiv = document.getElementById('resolution-result');
      if (!resultDiv) return;

      if (result.success) {
        resultDiv.style.display = 'block';
        resultDiv.className = 'resolution-result success';
        resultDiv.innerHTML = `
          <h4>✓ Mismatch Resolved Successfully</h4>
          <p>Action: ${action}</p>
          <p>The mismatch has been resolved and the action has been applied.</p>
          <button class="btn btn-primary" id="close-success-btn">Close</button>
        `;

        // Close button
        document.getElementById('close-success-btn')?.addEventListener('click', () => {
          this.hidePanel();

          // Emit event to refresh mismatch viewer
          const event = new CustomEvent('mismatch-resolved');
          document.dispatchEvent(event);
        });
      } else {
        resultDiv.style.display = 'block';
        resultDiv.className = 'resolution-result error';
        resultDiv.innerHTML = `
          <h4>✗ Resolution Failed</h4>
          <p>Error: ${result.error}</p>
          <button class="btn btn-secondary" id="retry-btn">Try Again</button>
        `;

        // Retry button
        document.getElementById('retry-btn')?.addEventListener('click', () => {
          resultDiv.style.display = 'none';
          if (resolveBtn) {
            resolveBtn.disabled = false;
            resolveBtn.textContent = 'Resolve Mismatch';
          }
        });
      }
    } catch (error) {
      console.error('Failed to resolve mismatch', error);

      const resultDiv = document.getElementById('resolution-result');
      if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.className = 'resolution-result error';
        resultDiv.innerHTML = `
          <h4>✗ Resolution Failed</h4>
          <p>Network error occurred. Please try again.</p>
        `;
      }

      if (resolveBtn) {
        resolveBtn.disabled = false;
        resolveBtn.textContent = 'Resolve Mismatch';
      }
    }
  }
}
