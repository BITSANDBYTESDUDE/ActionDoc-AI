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

export function ProjectCreateButton({ label = 'New project' }: { label?: string }) {
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a project</DialogTitle>
            <DialogDescription>
              Projects group actions so progress can be tracked against a deliverable.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const startDate = String(data.get('startDate') ?? '').trim();
              const endDate = String(data.get('endDate') ?? '').trim();

              setSaving(true);
              setError(null);
              try {
                await api.post('/api/projects', {
                  name: String(data.get('name') ?? '').trim(),
                  description: String(data.get('description') ?? '').trim(),
                  status: data.get('status'),
                  startDate: startDate ? new Date(startDate).toISOString() : null,
                  endDate: endDate ? new Date(endDate).toISOString() : null,
                });
                toast({ tone: 'success', title: 'Project created' });
                setOpen(false);
                router.refresh();
              } catch (createError) {
                setError(
                  createError instanceof ApiError
                    ? (createError.fieldMessage ?? createError.message)
                    : 'The project could not be created.',
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="project-name">Name</Label>
              <Input id="project-name" name="name" required maxLength={200} placeholder="Q3 client onboarding" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="project-description">Description</Label>
              <Textarea id="project-description" name="description" rows={3} maxLength={5000} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="project-state">Status</Label>
                <Select id="project-state" name="status" defaultValue="PLANNING">
                  <option value="PLANNING">Planning</option>
                  <option value="ACTIVE">Active</option>
                  <option value="COMPLETED">Completed</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-start">Start</Label>
                <Input id="project-start" name="startDate" type="date" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="project-end">End</Label>
                <Input id="project-end" name="endDate" type="date" />
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
                Create project
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}