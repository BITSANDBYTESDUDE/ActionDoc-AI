'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/utils/api-client';
import { useToast } from '@/components/ui/toast';

interface Option {
  id: string;
  name: string;
}

/**
 * Creates an action directly, without an AI suggestion. This is the same
 * endpoint used by the API, with the same validation, so a hand-written action
 * is indistinguishable from an approved one except for its `aiGenerated` flag.
 */
export function ActionQuickCreate({ members, projects }: { members: Option[]; projects: Option[] }) {
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(form: HTMLFormElement) {
    const data = new FormData(form);
    const dueDate = String(data.get('dueDate') ?? '').trim();
    const assigneeId = String(data.get('assigneeId') ?? '');
    const projectId = String(data.get('projectId') ?? '');

    setSaving(true);
    setError(null);

    try {
      await api.post('/api/actions', {
        title: String(data.get('title') ?? '').trim(),
        description: String(data.get('description') ?? '').trim(),
        priority: data.get('priority'),
        actionType: data.get('actionType'),
        assigneeId: assigneeId || null,
        projectId: projectId || null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      });

      toast({ tone: 'success', title: 'Action created' });
      setOpen(false);
      form.reset();
      router.refresh();
    } catch (createError) {
      setError(
        createError instanceof ApiError
          ? (createError.fieldMessage ?? createError.message)
          : 'The action could not be created.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        Create action
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create an action</DialogTitle>
            <DialogDescription>
              For work that did not come from a document. It is tracked exactly like an approved
              AI suggestion.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void create(event.currentTarget);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-title">Title</Label>
              <Input id="new-title" name="title" required maxLength={300} placeholder="Follow up with the client on scope" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-description">Description</Label>
              <Textarea id="new-description" name="description" rows={3} maxLength={5000} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-assignee">Assignee</Label>
                <Select id="new-assignee" name="assigneeId" defaultValue="">
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-due">Due date</Label>
                <Input id="new-due" name="dueDate" type="date" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-priority">Priority</Label>
                <Select id="new-priority" name="priority" defaultValue="MEDIUM">
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-type">Type</Label>
                <Select id="new-type" name="actionType" defaultValue="TASK">
                  <option value="TASK">Task</option>
                  <option value="DECISION">Decision</option>
                  <option value="FOLLOW_UP">Follow-up</option>
                  <option value="DEADLINE">Deadline</option>
                  <option value="REMINDER">Reminder</option>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="new-project">Project</Label>
                <Select id="new-project" name="projectId" defaultValue="">
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                Create action
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}