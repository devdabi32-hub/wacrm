'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, SlidersHorizontal, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { getOwnerId } from '@/lib/workspace/owner';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

// ─── Types ───────────────────────────────────────────────────────────────────

type FieldType = 'text' | 'number' | 'date' | 'url' | 'select';

interface CustomField {
    id: string;
    user_id: string;
    field_name: string;
    field_type: FieldType;
    field_options: string[] | null;
    created_at: string;
}

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
    text: 'Text',
    number: 'Number',
    date: 'Date',
    url: 'URL / Link',
    select: 'Dropdown (Select)',
};

const FIELD_TYPE_DESCRIPTIONS: Record<FieldType, string> = {
    text: 'Free-form text — names, notes, destinations',
    number: 'Numeric value — group size, budget amount',
    date: 'Date picker — travel dates, booking date',
    url: 'Clickable link — itinerary PDF, Drive link',
    select: 'Predefined options — booking status, tour type',
};

// ─── Component ───────────────────────────────────────────────────────────────

export function CustomFieldManager() {
    const supabase = createClient();
    const { user, loading: authLoading } = useAuth();

    const [fields, setFields] = useState<CustomField[]>([]);
    const [loading, setLoading] = useState(true);

    // Create dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [newFieldName, setNewFieldName] = useState('');
    const [newFieldType, setNewFieldType] = useState<FieldType>('text');
    const [newFieldOptions, setNewFieldOptions] = useState(''); // comma-separated
    const [saving, setSaving] = useState(false);

    // Delete dialog state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [fieldToDelete, setFieldToDelete] = useState<CustomField | null>(null);
    const [deleting, setDeleting] = useState(false);

    // ── Fetch ──────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            setLoading(false);
            return;
        }
        fetchFields(user.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, user?.id]);

    async function fetchFields(userId: string) {
        try {
            setLoading(true);
            const ownerId = await getOwnerId(supabase, userId);
            const { data, error } = await supabase
                .from('custom_fields')
                .select('*')
                .eq('user_id', ownerId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setFields((data as CustomField[]) || []);
        } catch (err) {
            console.error('Failed to fetch custom fields:', err);
            toast.error('Failed to load custom fields');
        } finally {
            setLoading(false);
        }
    }

    // ── Create ─────────────────────────────────────────────────────────────────

    async function handleCreate() {
        const name = newFieldName.trim();
        if (!name) {
            toast.error('Field name is required');
            return;
        }
        if (!user) {
            toast.error('Not authenticated');
            return;
        }

        // Prevent duplicate field names
        if (fields.some((f) => f.field_name.toLowerCase() === name.toLowerCase())) {
            toast.error('A field with this name already exists');
            return;
        }

        const options =
            newFieldType === 'select'
                ? newFieldOptions
                    .split(',')
                    .map((o) => o.trim())
                    .filter(Boolean)
                : null;

        if (newFieldType === 'select' && (!options || options.length === 0)) {
            toast.error('Add at least one option for dropdown fields');
            return;
        }

        try {
            setSaving(true);
            const ownerId = await getOwnerId(supabase, user.id);
            const { data, error } = await supabase
                .from('custom_fields')
                .insert({
                    user_id: ownerId,
                    field_name: name,
                    field_type: newFieldType,
                    field_options: options,
                })
                .select()
                .single();

            if (error) throw error;

            toast.success('Field created');
            setFields((prev) => [...prev, data as CustomField]);
            resetDialog();
        } catch (err) {
            console.error('Create error:', err);
            toast.error('Failed to create field');
        } finally {
            setSaving(false);
        }
    }

    function resetDialog() {
        setDialogOpen(false);
        setNewFieldName('');
        setNewFieldType('text');
        setNewFieldOptions('');
    }

    // ── Delete ─────────────────────────────────────────────────────────────────

    function confirmDelete(field: CustomField) {
        setFieldToDelete(field);
        setDeleteDialogOpen(true);
    }

    async function handleDelete() {
        if (!fieldToDelete) return;
        try {
            setDeleting(true);
            const { error } = await supabase
                .from('custom_fields')
                .delete()
                .eq('id', fieldToDelete.id);

            if (error) throw error;

            toast.success('Field deleted');
            setFields((prev) => prev.filter((f) => f.id !== fieldToDelete.id));
            setDeleteDialogOpen(false);
            setFieldToDelete(null);
        } catch (err) {
            console.error('Delete error:', err);
            toast.error('Failed to delete field');
        } finally {
            setDeleting(false);
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="size-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-4 mt-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-foreground">Custom Fields</h2>
                    <p className="text-sm text-muted-foreground">
                        Define extra data fields for your contacts — tour preferences,
                        booking status, travel dates, and more.
                    </p>
                </div>
                <Button
                    onClick={() => setDialogOpen(true)}
                    className="bg-primary hover:bg-primary/80 text-foreground"
                >
                    <Plus className="size-4" />
                    New Field
                </Button>
            </div>

            {/* Field list */}
            {fields.length === 0 ? (
                <Card className="bg-card border-border ring-0">
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                        <SlidersHorizontal className="size-8 text-slate-600 mb-3" />
                        <p className="text-muted-foreground text-sm">No custom fields yet.</p>
                        <p className="text-muted-foreground text-xs mt-1">
                            Create fields to track tour interest, travel dates, booking
                            status, and more on every contact.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <Card className="bg-card border-border ring-0">
                    <CardContent className="pt-2 pb-2">
                        <div className="divide-y divide-border">
                            {fields.map((field) => (
                                <div
                                    key={field.id}
                                    className="flex items-center gap-3 py-3 group"
                                >
                                    <GripVertical className="size-4 text-slate-600 shrink-0" />

                                    {/* Field info */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">
                                            {field.field_name}
                                        </p>
                                        {field.field_type === 'select' &&
                                            field.field_options &&
                                            field.field_options.length > 0 && (
                                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                                    Options: {field.field_options.join(', ')}
                                                </p>
                                            )}
                                    </div>

                                    {/* Type badge */}
                                    <span className="shrink-0 inline-flex items-center rounded-md bg-secondary border border-border px-2 py-0.5 text-xs text-muted-foreground">
                                        {FIELD_TYPE_LABELS[field.field_type] ?? field.field_type}
                                    </span>

                                    {/* Delete */}
                                    <button
                                        onClick={() => confirmDelete(field)}
                                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 p-1 rounded"
                                        title="Delete field"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── Create Dialog ── */}
            <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetDialog(); else setDialogOpen(true); }}>
                <DialogContent className="bg-card border-border sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">New Custom Field</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            This field will appear on every contact&apos;s profile under the
                            Custom tab.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Field name */}
                        <div className="space-y-2">
                            <Label className="text-muted-foreground">Field Name</Label>
                            <Input
                                placeholder="e.g. Tour Interest"
                                value={newFieldName}
                                onChange={(e) => setNewFieldName(e.target.value)}
                                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newFieldType !== 'select') handleCreate();
                                }}
                            />
                        </div>

                        {/* Field type */}
                        <div className="space-y-2">
                            <Label className="text-muted-foreground">Field Type</Label>
                            <Select
                                value={newFieldType}
                                onValueChange={(v) => setNewFieldType(v as FieldType)}
                            >
                                <SelectTrigger className="bg-secondary border-border text-foreground">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-secondary border-border">
                                    {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map((type) => (
                                        <SelectItem
                                            key={type}
                                            value={type}
                                            className="text-foreground focus:bg-muted"
                                        >
                                            <div>
                                                <p className="font-medium">{FIELD_TYPE_LABELS[type]}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {FIELD_TYPE_DESCRIPTIONS[type]}
                                                </p>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Options — only for select type */}
                        {newFieldType === 'select' && (
                            <div className="space-y-2">
                                <Label className="text-muted-foreground">
                                    Options{' '}
                                    <span className="text-muted-foreground font-normal">
                                        (comma-separated)
                                    </span>
                                </Label>
                                <Input
                                    placeholder="Domestic, International, Adventure, Honeymoon"
                                    value={newFieldOptions}
                                    onChange={(e) => setNewFieldOptions(e.target.value)}
                                    className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                                />
                                {newFieldOptions.trim() && (
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                        {newFieldOptions
                                            .split(',')
                                            .map((o) => o.trim())
                                            .filter(Boolean)
                                            .map((opt) => (
                                                <span
                                                    key={opt}
                                                    className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                                                >
                                                    {opt}
                                                </span>
                                            ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="border-t border-border pt-4">
                        <Button
                            variant="outline"
                            onClick={resetDialog}
                            className="border-border text-muted-foreground hover:bg-secondary"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreate}
                            disabled={saving}
                            className="bg-primary hover:bg-primary/80 text-foreground"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                'Create Field'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Delete Confirmation Dialog ── */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="bg-card border-border sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Delete Field</DialogTitle>
                        <DialogDescription className="text-muted-foreground">
                            Are you sure you want to delete &quot;{fieldToDelete?.field_name}&quot;?
                            All saved values for this field across all contacts will also be
                            deleted. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="border-t border-border pt-4">
                        <Button
                            variant="outline"
                            onClick={() => setDeleteDialogOpen(false)}
                            className="border-border text-muted-foreground hover:bg-secondary"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-red-600 hover:bg-red-700 text-foreground"
                        >
                            {deleting ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" />
                                    Deleting...
                                </>
                            ) : (
                                'Delete Field'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}