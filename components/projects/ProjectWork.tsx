import Link from 'next/link';
import { ArrowRight, ClipboardList, MessageSquare, TriangleAlert } from '@/components/ui/icons';
import { BADGE_AMBER, BADGE_SLATE, CARD, FIELD, LABEL, LINK_ARROW } from '@/components/discovery/tokens';
import { EmptyState } from '@/components/provider/WorkspaceNotices';
import { PendingButton } from '@/components/provider/ProviderControls';
import { formatMoney } from '@/features/provider-workspace/format';
import { ROLE_LABEL, TASK_STATUS_COPY, type Project, type ProjectTask } from '@/features/projects/project';
import type { ProjectActivity, ProjectMessage } from '@/features/projects/messages';
import type { ProjectTaskDetail } from '@/features/projects/task';
import {
  addProjectStageAction,
  addProjectTaskAction,
  moveProjectTaskAction,
  sendProjectMessageAction,
  setProjectTaskStatusAction,
  updateProjectTaskAction,
} from '@/features/projects/actions';

/**
 * The plan, one task in depth, and the conversation.
 *
 * ⚠️ ROLE-BASED CONTROLS COME FROM THE BACKEND, TWICE OVER. The task buttons are the transitions the state machine
 * computed for this caller; the planning forms are hidden from a platform admin because the commands refuse an
 * admin write. The hiding is a courtesy — the refusal is the control — and both are stated on the page.
 *
 * ⚠️ NO OPTIMISTIC STATUS ANYWHERE. Every action is a server-action form and every page re-reads from the database,
 * so a task never reads "in progress" because a click said so before the write landed.
 */

function statusBadge(status: ProjectTask['status']) {
  const copy = TASK_STATUS_COPY[status];
  return (
    <span
      className={
        copy.tone === 'teal'
          ? 'inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-0.5 font-sans text-[11px] font-bold tracking-wider text-primary uppercase'
          : copy.tone === 'amber'
            ? BADGE_AMBER
            : BADGE_SLATE
      }
    >
      {copy.label}
    </span>
  );
}

export function ProjectWorkSection({
  project,
  filters,
}: {
  project: Project;
  filters: { assignee: string; status: string; stage: string };
}) {
  const canPlan = project.role !== 'admin';
  const assignmentId = project.header.assignmentId;
  const matches = (task: ProjectTask) => {
    if (filters.status && task.status !== filters.status) return false;
    if (filters.assignee && (task.assigneeRole ?? 'unassigned') !== filters.assignee) return false;
    return true;
  };

  const stages = project.stages
    .filter(stage => !filters.stage || stage.id === filters.stage)
    .map(stage => ({ ...stage, visible: stage.tasks.filter(matches) }));
  const totalVisible = stages.reduce((sum, stage) => sum + stage.visible.length, 0);

  return (
    <div className="grid gap-5">
      <form method="get" action={`/projects/${assignmentId}/work`} className={`${CARD} flex flex-wrap items-end gap-3 p-5`}>
        <div className="min-w-0 flex-1">
          <label htmlFor="assignee" className={LABEL}>
            Assigned to
          </label>
          <select id="assignee" name="assignee" defaultValue={filters.assignee} className={FIELD}>
            <option value="">Anyone</option>
            <option value="provider">The provider</option>
            <option value="customer">The customer</option>
            <option value="unassigned">Nobody in particular</option>
          </select>
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="status" className={LABEL}>
            Status
          </label>
          <select id="status" name="status" defaultValue={filters.status} className={FIELD}>
            <option value="">Every status</option>
            {(Object.keys(TASK_STATUS_COPY) as ProjectTask['status'][]).map(status => (
              <option key={status} value={status}>
                {TASK_STATUS_COPY[status].label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 flex-1">
          <label htmlFor="stage" className={LABEL}>
            Stage
          </label>
          <select id="stage" name="stage" defaultValue={filters.stage} className={FIELD}>
            <option value="">Every stage</option>
            {project.stages.map(stage => (
              <option key={stage.id} value={stage.id}>
                {stage.ordinal}. {stage.title}
              </option>
            ))}
          </select>
        </div>
        <PendingButton
          idle="Apply"
          pending="Applying…"
          className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        />
        {filters.assignee || filters.status || filters.stage ? (
          <Link href={`/projects/${assignmentId}/work`} className={LINK_ARROW}>
            Clear
          </Link>
        ) : null}
      </form>

      <p className="text-xs leading-relaxed text-slate-500">
        {totalVisible} task{totalVisible === 1 ? '' : 's'} shown of {project.progress.tasksTotal}.{' '}
        {canPlan
          ? 'This is the plan for the work; the job’s own approval is what releases payment.'
          : 'You are reading this project as platform staff: the plan is visible and editing it is not part of this page.'}
      </p>

      {project.stages.length === 0 ? (
        <EmptyState title="No plan written yet">
          {canPlan
            ? 'Break the work into stages and tasks so both sides can see what happens when. Start with a stage below.'
            : 'Nobody has written a stage or a task on this job yet.'}
        </EmptyState>
      ) : (
        <ol className="grid gap-4">
          {stages.map(stage => (
            <li key={stage.id} className={`${CARD} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
                    <ClipboardList aria-hidden="true" className="h-4 w-4 text-primary" />
                    {stage.ordinal}. {stage.title}
                  </h2>
                  {stage.description ? (
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{stage.description}</p>
                  ) : null}
                </div>
                <span className={BADGE_SLATE}>
                  {stage.doneCount}/{stage.taskCount} done
                </span>
              </div>

              {stage.visible.length === 0 ? (
                <p className="mt-3 text-xs leading-relaxed text-slate-500">Nothing in this stage matches the filters.</p>
              ) : (
                <ul className="mt-3 grid gap-2">
                  {stage.visible.map(task => (
                    <li key={task.id} className="rounded-xl border border-solid border-slate-200 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <Link
                          href={`/projects/${assignmentId}/tasks/${task.id}`}
                          className="text-sm font-semibold text-slate-900 no-underline hover:text-primary"
                        >
                          {task.ordinal}. {task.title}
                        </Link>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {statusBadge(task.status)}
                          {task.assigneeRole ? <span className={BADGE_SLATE}>{ROLE_LABEL[task.assigneeRole]}</span> : <span className={BADGE_SLATE}>Unassigned</span>}
                        </span>
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        {task.criteriaTotal > 0 ? (
                          <span>
                            {task.criteriaDone}/{task.criteriaTotal} criteria met
                          </span>
                        ) : null}
                        {task.scheduledEnd ? (
                          <span>
                            Due {new Date(task.scheduledEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        ) : null}
                        {task.blockedReason ? <span className="font-semibold text-amber-800">Blocked: {task.blockedReason}</span> : null}
                      </p>
                      {canPlan && task.status !== 'completed' ? (
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <form action={moveProjectTaskAction}>
                            <input type="hidden" name="assignment_id" value={assignmentId} />
                            <input type="hidden" name="task_id" value={task.id} />
                            <input type="hidden" name="direction" value="up" />
                            <input type="hidden" name="next" value={`/projects/${assignmentId}/work`} />
                            <PendingButton
                              idle="Move up"
                              pending="Moving…"
                              className="rounded-lg border border-solid border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </form>
                          <form action={moveProjectTaskAction}>
                            <input type="hidden" name="assignment_id" value={assignmentId} />
                            <input type="hidden" name="task_id" value={task.id} />
                            <input type="hidden" name="direction" value="down" />
                            <input type="hidden" name="next" value={`/projects/${assignmentId}/work`} />
                            <PendingButton
                              idle="Move down"
                              pending="Moving…"
                              className="rounded-lg border border-solid border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                            />
                          </form>
                          <Link href={`/projects/${assignmentId}/tasks/${task.id}`} className={LINK_ARROW}>
                            Open
                          </Link>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {canPlan ? (
                <form action={addProjectTaskAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-solid border-slate-200 pt-4">
                  <input type="hidden" name="assignment_id" value={assignmentId} />
                  <input type="hidden" name="stage_id" value={stage.id} />
                  <input type="hidden" name="next" value={`/projects/${assignmentId}/work`} />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`task_${stage.id}`} className={LABEL}>
                      Add a task to this stage
                    </label>
                    <input id={`task_${stage.id}`} name="title" required minLength={2} maxLength={200} className={FIELD} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`assignee_${stage.id}`} className={LABEL}>
                      Assigned to
                    </label>
                    <select id={`assignee_${stage.id}`} name="assignee_account_id" defaultValue="" className={FIELD}>
                      <option value="">Nobody in particular</option>
                      {project.header.customerAccountId ? (
                        <option value={project.header.customerAccountId}>{project.header.customerName ?? 'The customer'}</option>
                      ) : null}
                      {project.header.providerAccountId ? (
                        <option value={project.header.providerAccountId}>{project.header.providerName ?? 'The provider'}</option>
                      ) : null}
                    </select>
                  </div>
                  <PendingButton
                    idle="Add task"
                    pending="Adding…"
                    className="inline-flex items-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </form>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {canPlan ? (
        <form action={addProjectStageAction} className={`${CARD} flex flex-wrap items-end gap-2 p-5`}>
          <input type="hidden" name="assignment_id" value={assignmentId} />
          <input type="hidden" name="next" value={`/projects/${assignmentId}/work`} />
          <div className="min-w-0 flex-1">
            <label htmlFor="stage_title" className={LABEL}>
              Add a stage
            </label>
            <input id="stage_title" name="title" required minLength={2} maxLength={200} className={FIELD} />
          </div>
          <div className="min-w-0 flex-[2]">
            <label htmlFor="stage_description" className={LABEL}>
              What it covers (optional)
            </label>
            <input id="stage_description" name="description" maxLength={2000} className={FIELD} />
          </div>
          <PendingButton
            idle="Add stage"
            pending="Adding…"
            className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          />
        </form>
      ) : null}
    </div>
  );
}

export function TaskDetailView({ detail, notice }: { detail: ProjectTaskDetail; notice?: React.ReactNode }) {
  const { task } = detail;
  const canEdit = detail.role !== 'admin' && task.status !== 'completed';
  const taskHref = `/projects/${task.assignmentId}/tasks/${task.id}`;

  return (
    <div className="grid gap-5">
      {notice}

      <section className={`${CARD} p-5`} aria-labelledby="task-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-sans text-[11px] font-bold tracking-wider text-primary uppercase">
              {task.stageTitle} · task {task.ordinal}
            </p>
            <h2 id="task-heading" className="mt-1.5 text-lg font-bold tracking-tight text-slate-900">
              {task.title}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {task.assigneeName
                ? `Assigned to ${task.assigneeName}${task.assigneeRole ? ` (${ROLE_LABEL[task.assigneeRole].toLowerCase()})` : ''}`
                : 'Nobody in particular'}
            </p>
          </div>
          {statusBadge(task.status)}
        </div>

        {task.description ? (
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-slate-700">{task.description}</p>
        ) : null}

        {task.blockedReason ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-solid border-secondary bg-secondary-light p-3 text-xs leading-relaxed text-amber-900">
            <TriangleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800" />
            Blocked: {task.blockedReason}
          </p>
        ) : null}

        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Window</dt>
            <dd className="mt-0.5 text-slate-700">
              {task.scheduledStart
                ? `${new Date(task.scheduledStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${
                    task.scheduledEnd
                      ? ` → ${new Date(task.scheduledEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                      : ''
                  }`
                : 'No window set'}
            </dd>
          </div>
          <div>
            <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Submitted</dt>
            <dd className="mt-0.5 text-slate-700">
              {task.submittedAt
                ? new Date(task.submittedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : 'Not yet'}
            </dd>
          </div>
          <div>
            <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">Completed</dt>
            <dd className="mt-0.5 text-slate-700">
              {task.completedAt
                ? new Date(task.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                : 'Not yet'}
            </dd>
          </div>
        </dl>
      </section>

      <section className={`${CARD} p-5`} aria-labelledby="criteria-heading">
        <h2 id="criteria-heading" className="text-sm font-bold tracking-tight text-slate-900">
          Completion criteria
        </h2>
        {task.criteria.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            No criteria written. Without them, &ldquo;done&rdquo; means whatever each side assumes it means — worth
            writing down before the work starts.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {task.criteria.map(criterion => (
              <li key={criterion.label} className="flex items-start gap-2 text-sm text-slate-700">
                <span aria-hidden="true" className={criterion.done ? 'text-primary' : 'text-slate-300'}>
                  {criterion.done ? '●' : '○'}
                </span>
                {criterion.label}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs leading-relaxed text-slate-500">
          The criteria say what the work has to achieve. Ticking is not what completes a task — the provider submits
          it and the customer approves it.
        </p>
      </section>

      {Object.keys(task.scopeParameters).length > 0 ? (
        <section className={`${CARD} p-5`} aria-labelledby="scope-heading">
          <h2 id="scope-heading" className="text-sm font-bold tracking-tight text-slate-900">
            Scope parameters
          </h2>
          <dl className="mt-3 grid gap-2 text-xs">
            {Object.entries(task.scopeParameters).map(([key, value]) => (
              <div key={key} className="rounded-xl border border-solid border-slate-200 p-3">
                <dt className="font-sans font-bold tracking-wider text-slate-500 uppercase">{key.replaceAll('_', ' ')}</dt>
                <dd className="mt-0.5 text-slate-700">{value || '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className={`${CARD} p-5`} aria-labelledby="task-money-heading">
        <h2 id="task-money-heading" className="text-sm font-bold tracking-tight text-slate-900">
          Payment behind this task
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          {detail.money.obligationStatus
            ? `The job carries a payment obligation in state “${detail.money.obligationStatus.replaceAll('_', ' ')}”${
                detail.money.amountMinor && detail.money.currencyCode
                  ? ` (${formatMoney(detail.money.amountMinor, detail.money.currencyCode)})`
                  : ''
              }. Completing tasks does not release it — the job's own approval does.`
            : 'This job carries no payment obligation, so no task on it is waiting on money.'}
        </p>
      </section>

      {detail.allowedTransitions.length > 0 ? (
        <section className={`${CARD} p-5`} aria-labelledby="transitions-heading">
          <h2 id="transitions-heading" className="text-sm font-bold tracking-tight text-slate-900">
            What you can do
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
            These are the moves the platform accepts from you on this task, in this state. The database applies each
            one and this page re-reads the task afterwards — nothing here changes optimistically.
          </p>
          <div className="mt-3 grid gap-3">
            {detail.allowedTransitions.map(transition => (
              <form
                key={transition.status}
                action={setProjectTaskStatusAction}
                className="grid gap-2 rounded-xl border border-solid border-slate-200 p-3.5"
              >
                <input type="hidden" name="assignment_id" value={task.assignmentId} />
                <input type="hidden" name="task_id" value={task.id} />
                <input type="hidden" name="status" value={transition.status} />
                <input type="hidden" name="next" value={taskHref} />
                <label htmlFor={`note_${transition.status}`} className={LABEL}>
                  {transition.label} — note (optional)
                </label>
                <input
                  id={`note_${transition.status}`}
                  name="note"
                  maxLength={500}
                  placeholder={
                    transition.status === 'blocked'
                      ? 'e.g. The gate was locked and nobody answered.'
                      : 'Anything the other side should know.'
                  }
                  className={FIELD}
                />
                <div>
                  <PendingButton
                    idle={transition.label}
                    pending="Saving…"
                    icon={<ArrowRight aria-hidden="true" className="h-4 w-4" />}
                    className={
                      transition.status === 'completed'
                        ? 'inline-flex items-center gap-2 rounded-lg border-0 bg-secondary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-60'
                        : 'inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60'
                    }
                  />
                </div>
              </form>
            ))}
          </div>
        </section>
      ) : (
        <p className="text-xs leading-relaxed text-slate-500">
          {task.status === 'completed'
            ? 'This task is complete: it is part of the record now rather than something to act on.'
            : detail.role === 'admin'
              ? 'You are reading this task as platform staff, so no moves are offered here.'
              : 'Nothing on this task is waiting on you — the next move is the other party’s.'}
        </p>
      )}

      {canEdit ? (
        <details className={`${CARD} p-5`}>
          <summary className="cursor-pointer text-sm font-bold tracking-tight text-slate-900">
            Edit the scope, criteria and window
          </summary>
          <form action={updateProjectTaskAction} className="mt-4 grid gap-4">
            <input type="hidden" name="assignment_id" value={task.assignmentId} />
            <input type="hidden" name="task_id" value={task.id} />
            <input type="hidden" name="next" value={taskHref} />
            <div>
              <label htmlFor="task_title" className={LABEL}>
                Title
              </label>
              <input id="task_title" name="title" required minLength={2} maxLength={200} defaultValue={task.title} className={FIELD} />
            </div>
            <div>
              <label htmlFor="task_description" className={LABEL}>
                Description
              </label>
              <textarea id="task_description" name="description" rows={4} maxLength={4000} defaultValue={task.description ?? ''} className={FIELD} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="scheduled_start" className={LABEL}>
                  Window starts
                </label>
                <input
                  id="scheduled_start"
                  name="scheduled_start"
                  type="datetime-local"
                  defaultValue={task.scheduledStart ? task.scheduledStart.slice(0, 16) : ''}
                  className={FIELD}
                />
              </div>
              <div>
                <label htmlFor="scheduled_end" className={LABEL}>
                  Window ends
                </label>
                <input
                  id="scheduled_end"
                  name="scheduled_end"
                  type="datetime-local"
                  defaultValue={task.scheduledEnd ? task.scheduledEnd.slice(0, 16) : ''}
                  className={FIELD}
                />
              </div>
            </div>
            <div>
              <label htmlFor="criteria_lines" className={LABEL}>
                Completion criteria, one per line
              </label>
              <textarea
                id="criteria_lines"
                name="criteria_lines"
                rows={4}
                defaultValue={task.criteria.map(criterion => criterion.label).join('\n')}
                aria-describedby="criteria-help"
                className={FIELD}
              />
              <p id="criteria-help" className="mt-1.5 text-xs leading-relaxed text-slate-500">
                The box holds the criteria already on this task, so an empty box means no criteria — not a wiped
                checklist. Prefix a line with &ldquo;[x]&rdquo; to record one as already met.
              </p>
            </div>
            <div>
              <label htmlFor="scope_lines" className={LABEL}>
                Scope parameters, one per line as &ldquo;name: value&rdquo;
              </label>
              <textarea
                id="scope_lines"
                name="scope_lines"
                rows={3}
                defaultValue={Object.entries(task.scopeParameters)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join('\n')}
                className={FIELD}
              />
            </div>
            <div>
              <PendingButton
                idle="Save the task"
                pending="Saving…"
                className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </form>
        </details>
      ) : null}

      {detail.siblings.length > 0 ? (
        <section className={`${CARD} p-5`} aria-labelledby="siblings-heading">
          <h2 id="siblings-heading" className="text-sm font-bold tracking-tight text-slate-900">
            The rest of {task.stageTitle}
          </h2>
          <ul className="mt-3 grid gap-2 text-xs">
            {detail.siblings.map(sibling => (
              <li key={sibling.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/projects/${task.assignmentId}/tasks/${sibling.id}`} className={LINK_ARROW}>
                  {sibling.ordinal}. {sibling.title}
                </Link>
                <span className="text-slate-500">{TASK_STATUS_COPY[sibling.status].label}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/**
 * The conversation, and the record beside it — two lists, on purpose.
 *
 * ⚠️ GROUPED BY CONTEXT, NOT ONE STREAM. A message about task 3 and a message about the quote are different
 * conversations about the same job; grouping them is what makes a decision findable later.
 */
export function ProjectMessagesSection({
  messages,
  activity,
  contexts,
  assignmentId,
  evidence,
  canPost,
  notice,
}: {
  messages: ProjectMessage[];
  activity: ProjectActivity[];
  contexts: { kind: string; label: string; tasks?: { id: string; title: string }[] }[];
  assignmentId: string;
  evidence: { id: string; kind: string; note: string | null }[];
  canPost: boolean;
  notice?: React.ReactNode;
}) {
  const grouped = new Map<string, ProjectMessage[]>();
  for (const message of messages) {
    const key = message.contextKind === 'task' ? `task:${message.contextId}` : message.contextKind;
    const list = grouped.get(key) ?? [];
    list.push(message);
    grouped.set(key, list);
  }

  return (
    <div className="grid gap-5">
      {notice}

      {messages.length === 0 ? (
        <EmptyState title="No messages yet">
          Nothing has been said on this project. Anything agreed in conversation belongs here, because a promise made
          elsewhere is not part of the record.
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {[...grouped.entries()].map(([key, list]) => (
            <section key={key} className={`${CARD} p-5`} aria-labelledby={`thread-${key}`}>
              <h2 id={`thread-${key}`} className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
                <MessageSquare aria-hidden="true" className="h-4 w-4 text-primary" />
                {list[0].contextLabel}
              </h2>
              <ul className="mt-3 grid gap-3">
                {list.map(message => (
                  <li
                    key={message.id}
                    className={`rounded-xl border border-solid p-3.5 ${
                      message.authorRole === 'provider' ? 'border-primary-subtle bg-primary-surface' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800">
                        {message.authorName}
                        <span className="ml-2 font-normal text-slate-500">{ROLE_LABEL[message.authorRole]}</span>
                      </span>
                      <span className="font-sans text-[11px] tracking-wide text-slate-400 uppercase">
                        {message.createdAt
                          ? new Date(message.createdAt).toLocaleString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-slate-700">{message.body}</p>

                    {message.attachment ? (
                      <p className="mt-2 rounded-lg border border-solid border-slate-200 bg-white p-2.5 text-xs text-slate-600">
                        <strong className="font-semibold">Attachment:</strong> {message.attachment.kind ?? 'file'}
                        {message.attachment.note ? ` · ${message.attachment.note}` : ''}
                      </p>
                    ) : null}

                    {/* The original is always shown. A translation is an alternative view, never a replacement —
                        and there is none today because no translation provider is configured. */}
                    {message.translatedBody ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-semibold text-primary">
                          Translation ({message.translatedLanguage})
                        </summary>
                        <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-slate-700">
                          {message.translatedBody}
                        </p>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {canPost ? (
        <form action={sendProjectMessageAction} className={`${CARD} grid gap-3 p-5`}>
          <input type="hidden" name="assignment_id" value={assignmentId} />
          <input type="hidden" name="next" value={`/projects/${assignmentId}/messages`} />
          <div className="flex flex-wrap gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor="context_kind" className={LABEL}>
                What is this about?
              </label>
              <select id="context_kind" name="context_kind" defaultValue="project" className={FIELD}>
                {contexts.map(context => (
                  <option key={context.kind} value={context.kind}>
                    {context.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor="context_id" className={LABEL}>
                Which task (only for a task message)
              </label>
              <select id="context_id" name="context_id" defaultValue="" className={FIELD}>
                <option value="">Not a specific task</option>
                {(contexts.find(context => context.kind === 'task')?.tasks ?? []).map(task => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="body" className={LABEL}>
              Message
            </label>
            <textarea
              id="body"
              name="body"
              rows={4}
              required
              maxLength={4000}
              placeholder="Say what needs saying — this is the record both sides can point at later."
              className={FIELD}
            />
          </div>
          {evidence.length > 0 ? (
            <div>
              <label htmlFor="attachment_evidence_id" className={LABEL}>
                Attach an evidence item (optional)
              </label>
              <select id="attachment_evidence_id" name="attachment_evidence_id" defaultValue="" className={FIELD}>
                <option value="">No attachment</option>
                {evidence.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.kind}
                    {item.note ? ` — ${item.note}` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                Files are not uploaded here: evidence goes through the job&apos;s capture and upload flow, and a message
                points at what is already there.
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <PendingButton
              idle="Send message"
              pending="Sending…"
              className="inline-flex items-center gap-2 rounded-lg border-0 bg-primary px-5 py-2.5 font-sans text-xs font-bold tracking-wide text-white uppercase shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="text-xs leading-relaxed text-slate-500">
              The platform has no translation provider connected, so messages are stored and shown exactly as written.
              The record beside this thread is derived from actions, not from anything typed here.
            </p>
          </div>
        </form>
      ) : (
        <p className="text-xs leading-relaxed text-slate-500">
          You are reading this thread as platform staff. Posting into a customer&apos;s thread is support work with its
          own record, so this page does not offer it.
        </p>
      )}

      <section id="timeline" className={`${CARD} p-5`} aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="text-sm font-bold tracking-tight text-slate-900">
          The record
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          What actually happened on this job, in order, derived from the rows that caused it. This is deliberately not
          the chat above: a message is what somebody said, and this is what the platform recorded.
        </p>
        {activity.length === 0 ? (
          <p className="mt-3 text-xs leading-relaxed text-slate-500">Nothing has been recorded on this job yet.</p>
        ) : (
          <ol className="mt-3 grid gap-2">
            {activity.map((event, index) => (
              <li key={`${event.kind}-${index}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-slate-200 pb-2 text-xs last:border-0">
                <span className="text-slate-700">{event.label}</span>
                <span className="font-sans text-slate-400">
                  {event.at
                    ? new Date(event.at).toLocaleString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : ''}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
