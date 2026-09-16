'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/utils/api-client';
import { useToast } from '@/components/ui/toast';

/** Renames the active organization. OWNER/ADMIN only, enforced server-side. */
export function OrganizationSettingsForm({
  organizationId,
  name,
  canEdit,
}: {
  organizationId: string;
  name: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const nextName = String(new FormData(event.currentTarget).get('name') ?? '').trim();
        if (nextName === name) return;

        setSaving(true);
        setError(null);
        try {
          await api.patch(`/api/organizations/${organizationId}`, { name: nextName });
          toast({ tone: 'success', title: 'Organization updated' });
          router.refresh();
        } catch (updateError) {
          setError(
            updateError instanceof ApiError
              ? (updateError.fieldMessage ?? updateError.message)
              : 'The organization could not be updated.',
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="org-name">Organization name</Label>
        <Input id="org-name" name="name" defaultValue={name} maxLength={120} disabled={!canEdit} required />
        {!canEdit ? (
          <p className="text-[11px] text-muted-foreground">
            Only owners and admins can rename the organization.
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {canEdit ? (
        <Button type="submit" loading={saving} disabled={saving}>
          Save changes
        </Button>
      ) : null}
    </form>
  );
}