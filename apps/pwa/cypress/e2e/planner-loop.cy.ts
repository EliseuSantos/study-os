// M3 acceptance: a routine for today's weekday populates Today with a plan block,
// a due reminder appears in the queue, and stats render after a study session.
describe('planner and routine loop', () => {
  const stamp = Date.now();
  const routineTitle = `rotina e2e ${stamp}`;
  const reminderTitle = `lembrete e2e ${stamp}`;

  it('creates a routine for today and sees a plan block on Today', () => {
    cy.visit('/routines');
    cy.get('[data-testid="routine-title-input"]').type(routineTitle);
    const todayDow = new Date().getDay();
    cy.get(`[data-testid="routine-day-${todayDow}"]`).click();
    cy.get('[data-testid="routine-duration-input"]').clear();
    cy.get('[data-testid="routine-duration-input"]').type('90');
    cy.get('[data-testid="routine-submit"]').click();
    cy.get('[data-testid="routine-block"]').contains(routineTitle);

    cy.visit('/');
    cy.get('[data-testid="today-item"][data-kind="block"]').contains('estudo livre');
  });

  it('creates a due reminder and sees it on Today', () => {
    cy.visit('/reminders');
    cy.get('[data-testid="reminder-title-input"]').type(reminderTitle);
    const past = new Date(Date.now() - 60_000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = `${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}T${pad(past.getHours())}:${pad(past.getMinutes())}`;
    cy.get('[data-testid="reminder-datetime-input"]').type(local);
    cy.get('[data-testid="reminder-submit"]').click();
    cy.get('[data-testid="reminder-item"]').contains(reminderTitle);

    cy.visit('/');
    cy.get('[data-testid="today-item"][data-kind="reminder"]').contains(reminderTitle);
  });

  it('renders stats after a short study session', () => {
    cy.visit('/study');
    cy.get('[data-testid="timer-start"]').click();
    cy.wait(1500);
    cy.get('[data-testid="timer-finish"]').click();
    cy.get('[data-testid="session-save"]').click();
    cy.contains('sessão registrada');

    cy.visit('/stats');
    cy.get('[data-testid="stats-heatmap"]').should('be.visible');
    cy.get('[data-testid="stats-streak"]').contains('1');
    cy.get('[data-testid="stats-comparison"]').should('be.visible');
  });

  it('exports routines as .ics', () => {
    cy.visit('/reminders');
    cy.get('[data-testid="ics-export"]').click();
    cy.readFile('cypress/downloads/studyos.ics').should('contain', 'BEGIN:VCALENDAR');
  });
});
