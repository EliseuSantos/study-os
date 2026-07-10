// Exercises the browser → worker sync loop. Requires `wrangler dev` on :8787 and a
// baseUrl whose /sync is proxied to it (vite dev). Self-skips when the backend is down.
const WORKER = 'http://localhost:8787';
const AUTH = { authorization: 'Bearer dev-token' };

describe('sync loop', () => {
  let workerUp = false;

  before(() => {
    // cy.request fails the test on ECONNREFUSED, so probe with curl instead
    cy.exec(`curl -sf -o /dev/null --max-time 3 ${WORKER}/health`, {
      failOnNonZeroExit: false,
    }).then((result) => {
      workerUp = (result as unknown as { exitCode?: number }).exitCode === 0;
    });
  });

  beforeEach(function () {
    if (!workerUp) this.skip();
  });

  it('pushes a locally created goal to the worker', () => {
    const title = `push-e2e-${Date.now()}`;
    cy.visit('/');
    cy.get('[data-testid="goal-title-input"]').type(title);
    cy.get('[data-testid="goal-submit"]').click();
    cy.get('[data-testid="goal-item"]').contains(title);
    cy.get('[data-testid="sync-now"]').click();

    cy.request({
      url: `${WORKER}/sync/pull?since=0&device=cypress-probe`,
      headers: AUTH,
    }).then((res) => {
      const payloads = (res.body.ops as { payload: string }[]).map((o) => o.payload);
      expect(payloads.some((p) => p.includes(title))).to.equal(true);
    });
  });

  it('pulls a remotely pushed goal into the app', () => {
    const title = `pull-e2e-${Date.now()}`;
    const ts = Date.now();
    const row = {
      id: `goal-${ts}`,
      title,
      description: null,
      target_date: null,
      status: 'active',
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
    };
    cy.request({
      method: 'POST',
      url: `${WORKER}/sync/push`,
      headers: AUTH,
      body: {
        device_id: 'cypress-remote',
        ops: [
          {
            tbl: 'goals',
            row_id: row.id,
            op: 'upsert',
            payload: JSON.stringify(row),
            updated_at: ts,
            device_id: 'cypress-remote',
          },
        ],
      },
    });

    cy.visit('/');
    cy.get('[data-testid="sync-now"]').click();
    cy.get('[data-testid="goal-item"]', { timeout: 10000 }).contains(title);
  });
});
