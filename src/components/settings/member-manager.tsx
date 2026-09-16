'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/utils/api-client';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import type { UserRole } from '@/types';

interface Member {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  isPrimaryOwner: boolean;
}

const ROLE_OPTIONS: { value: UserRole; label: string; description: string }[] = [
  { value: 'OWNER', label: 'Owner', description: 'Full control, including billing and deletion.' },
  { value: 'ADMIN', label: 'Admin', description: 'Manage documents, actions, projects and members.' },
  { value: 'MEMBER', label: 'Member', description: 'Work with documents, actions and projects.' },
  { value: 'VIEWER', label: 'Viewer', description: 'Read-only access to everything in the workspace.' },
];

/**
 * Member management for a single organization.
 *
 * Role changes and removals are enforced server-side; the UI only hides controls
 * that would certainly be rejected (for example, demoting the primary owner).
 */
export function MemberManager({
  organizationId,
  members,
  currentUserId,
  currentRole,
}: {
  organizationId: string;
  members: Member[];
  currentUserId: string;
  currentRole: UserRole;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canManage = currentRole === 'OWNER' || currentRole === 'ADMIN';

  async function changeRole(member: Member, role: UserRole) {
    setBusy(member.membershipId);
    try {
      await api.patch(`/api/organizations/${organizationId}/members/${member.membershipId}`, { role });
      toast({ tone: 'success', title: `${member.name} is now ${role.toLowerCase()}` });
      router.refresh();
    } catch (roleError) {
      toast({
        tone: 'error',
        title: 'Could not change that role',
        description: roleError instanceof ApiError ? roleError.message : 'Please try again.',
      });
    } finally {
      setBusy(null);
    }
  }

  async function removeMember(member: Member) {
    setBusy(member.membershipId);
    try {
      await api.delete(`/api/organizations/${organizationId}/members/${member.membershipId}`);
      toast({ tone: 'success', title: `${member.name} was removed` });
      setRemoveTarget(null);
      router.refresh();
    } catch (removeError) {
      toast({
        tone: 'error',
        title: 'Could not remove that member',
        description: removeError instanceof ApiError ? removeError.message : 'Please try again.',
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {members.length} member{members.length === 1 ? '' : 's'} in this organization
        </p>
        {canManage ? (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus aria-hidden="true" />
            Add member
          </Button>
        ) : null}
      </div>

      <ul className="divide-y divide-border rounded-md border border-border">
        {members.map((member) => {
          const isSelf = member.userId === currentUserId;
          return (
            <li key={member.membershipId} className="flex flex-wrap items-center gap-3 p-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
                {member.name.slice(0, 2).toUpperCase()}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{member.name}</span>
                  {isSelf ? <Badge variant="outline">You</Badge> : null}
                  {member.isPrimaryOwner ? <Badge variant="default">Primary owner</Badge> : null}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
              </span>

              {canManage && !member.isPrimaryOwner ? (
                <>
                  <Select
                    value={member.role}
                    disabled={busy === member.membershipId}
                    onChange={(event) => void changeRole(member, event.target.value as UserRole)}
                    aria-label={`Role for ${member.name}`}
                    className="w-32"
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>

                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${member.name}`}
                    onClick={() => setRemoveTarget(member)}
                    disabled={busy === member.membershipId}
                  >
                    <Trash2 className="text-destructive" aria-hidden="true" />
                  </Button>
                </>
              ) : (
                <Badge variant="secondary">{member.role.toLowerCase()}</Badge>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog
        open={inviteOpen}
        onOpenChange={(next) => {
          setInviteOpen(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a member</DialogTitle>
            <DialogDescription>
              The person must already have an ActionDoc AI account. They gain access to this
              organization only - never any other workspace.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              setBusy('invite');
              setError(null);
              try {
                await api.post(`/api/organizations/${organizationId}/members`, {
                  email: String(data.get('email') ?? '').trim(),
                  role: data.get('role'),
                });
                toast({ tone: 'success', title: 'Member added' });
                setInviteOpen(false);
                router.refresh();
              } catch (inviteError) {
                setError(
                  inviteError instanceof ApiError
                    ? (inviteError.fieldMessage ?? inviteError.message)
                    : 'The member could not be added.',
                );
              } finally {
                setBusy(null);
              }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="member-email">Email address</Label>
              <Input id="member-email" name="email" type="email" required placeholder="colleague@company.com" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="member-role">Role</Label>
              <Select id="member-role" name="role" defaultValue="MEMBER">
                {ROLE_OPTIONS.filter((option) => option.value !== 'OWNER').map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} — {option.description}
                  </option>
                ))}
              </Select>
            </div>

            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)} disabled={busy === 'invite'}>
                Cancel
              </Button>
              <Button type="submit" loading={busy === 'invite'}>
                Add member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removeTarget)} onOpenChange={(next) => !next && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.name}?</DialogTitle>
            <DialogDescription>
              They lose access to this organization immediately. Actions assigned to them stay in the
              workspace and become unassigned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={Boolean(busy)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={Boolean(busy)}
              onClick={() => removeTarget && void removeMember(removeTarget)}
            >
              Remove member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}