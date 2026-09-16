'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/utils/api-client';
import { useToast } from '@/components/ui/toast';

/** Creates an additional organization for the signed-in user. */
export function CreateOrganizationButton({ label = 'New organization' }: { label?: string }) {
  const router = useRouter();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus aria-hidden="true" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create an organization</DialogTitle>
            <DialogDescription>
              Organizations are fully isolated workspaces. You will be its owner, and you can invite
              members afterwards.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const name = String(new FormData(event.currentTarget).get('name') ?? '').trim();

              setSaving(true);
              setError(null);
              try {
                const organization = await api.post<{ id: string; name: string }>(
                  '/api/organizations',
                  { name },
                );
                await api.post('/api/organizations/switch', { organizationId: organization.id });
                toast({ tone: 'success', title: 'Organization created', description: organization.name });
                setOpen(false);
                router.refresh();
              } catch (createError) {
                setError(
                  createError instanceof ApiError
                    ? (createError.fieldMessage ?? createError.message)
                    : 'The organization could not be created.',
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-org-name">Organization name</Label>
              <Input id="new-org-name" name="name" required maxLength={120} placeholder="Northwind Consulting" />
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
                <Building2 aria-hidden="true" />
                Create organization
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}