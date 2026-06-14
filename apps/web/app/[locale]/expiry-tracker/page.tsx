"use client";
import React, { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "@/lib/supabase";
import {
    Calendar,
    Trash2,
    Package,
    XCircle,
    AlertTriangle,
    CheckCircle2,
    Download,
    Upload,
    Search,
    Pencil,
    X,
} from "lucide-react";

interface Medicine {
    id: string;
    name: string;
    expiryDate: string;
    batchNumber?: string;
    notes?: string;
}

type FilterStatus = "all" | "expired" | "expiringSoon" | "safe";
type SortOption = "expirySoonest" | "expiryLatest" | "alpha";

export default function ExpiryTrackerPage() {
    const t = useTranslations("ExpiryTracker");
    const [medicines, setMedicines] = useState<Medicine[]>([]);
    const [userId, setUserId] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [expiryDate, setExpiryDate] = useState("");
    const [batchNumber, setBatchNumber] = useState("");
    const [notes, setNotes] = useState("");
    const [dateError, setDateError] = useState("");
    const [isExpired, setIsExpired] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<SortOption>("expirySoonest");
    const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
    const [importError, setImportError] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const {
                    data: { session },
                } = await supabase.auth.getSession();

                if (session?.user) {
                    setUserId(session.user.id);

                    const { data, error } = await supabase
                        .from("expiry_tracker_items")
                        .select("*")
                        .order("created_at", { ascending: false });

                    if (!error && data) {
                        const mapped = data.map((item) => ({
                            id: item.id,
                            name: item.brand_name,
                            expiryDate: item.expiry_date,
                            batchNumber: item.batch_number ?? "",
                            notes: item.notes ?? "",
                        }));

                        setMedicines(mapped);
                    }
                } else {
                    const saved = localStorage.getItem("sahidawa_expiry_tracker");

                    if (saved) {
                        setMedicines(JSON.parse(saved));
                    }
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoaded(true);
            }
        };

        loadData();
    }, []);

    const saveToLocalStorage = (updatedList: Medicine[]) => {
        setMedicines(updatedList);
        try {
            if (typeof window !== "undefined" && window.localStorage) {
                window.localStorage.setItem("sahidawa_expiry_tracker", JSON.stringify(updatedList));
            }
        } catch (e) {
            console.error("Failed to save medicines to localStorage:", e);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name || !expiryDate) return;

        if (!expiryDate || !isValidDateString(expiryDate)) {
            setDateError("Invalid expiry date");
            return;
        }

        const selected = parseLocalDate(expiryDate);
        const today = new Date();

        today.setHours(0, 0, 0, 0);
        selected.setHours(0, 0, 0, 0);

        if (selected < today) {
            setDateError("This medicine has already expired");
            return;
        }

        setDateError("");

        if (editingId) {
            if (userId) {
                const { error } = await supabase
                    .from("expiry_tracker_items")
                    .update({
                        brand_name: name,
                        batch_number: batchNumber || null,
                        expiry_date: expiryDate,
                        notes: notes || null,
                    })
                    .eq("id", editingId);

                if (!error) {
                    setMedicines(
                        medicines.map((m) =>
                            m.id === editingId ? { ...m, name, expiryDate, batchNumber, notes } : m
                        )
                    );
                }
            } else {
                const updated = medicines.map((m) =>
                    m.id === editingId ? { ...m, name, expiryDate, batchNumber, notes } : m
                );
                saveToLocalStorage(updated);
            }
            cancelEdit();
            return;
        }

        const newMedicine: Medicine = {
            id: Date.now().toString(),
            name,
            expiryDate,
            batchNumber,
            notes,
        };
        if (userId) {
            const { data, error } = await supabase
                .from("expiry_tracker_items")
                .insert({
                    user_id: userId,
                    brand_name: name,
                    batch_number: batchNumber || null,
                    expiry_date: expiryDate,
                    notes: notes || null,
                })
                .select()
                .single();

            if (!error && data) {
                setMedicines([
                    ...medicines,
                    {
                        id: data.id,
                        name: data.brand_name,
                        expiryDate: data.expiry_date,
                        batchNumber: data.batch_number ?? "",
                        notes: data.notes ?? "",
                    },
                ]);
            }
        } else {
            saveToLocalStorage([...medicines, newMedicine]);
        }
        setName("");
        setExpiryDate("");
        setBatchNumber("");
        setNotes("");
    };

    const handleDelete = async (id: string) => {
        if (userId) {
            await supabase.from("expiry_tracker_items").delete().eq("id", id);

            setMedicines(medicines.filter((med) => med.id !== id));
        } else {
            saveToLocalStorage(medicines.filter((med) => med.id !== id));
        }
        if (editingId === id) {
            cancelEdit();
        }
        setSelectedIds((prev) => {
            if (!prev.has(id)) return prev;
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const startEdit = (med: Medicine) => {
        setEditingId(med.id);
        setName(med.name);
        setExpiryDate(med.expiryDate);
        setBatchNumber(med.batchNumber ?? "");
        setNotes(med.notes ?? "");
        setDateError("");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setName("");
        setExpiryDate("");
        setBatchNumber("");
        setNotes("");
        setDateError("");
        setIsExpired(false);
    };

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        const ids = Array.from(selectedIds);
        if (userId) {
            await supabase.from("expiry_tracker_items").delete().in("id", ids);

            setMedicines(medicines.filter((med) => !selectedIds.has(med.id)));
        } else {
            saveToLocalStorage(medicines.filter((med) => !selectedIds.has(med.id)));
        }
        setSelectedIds(new Set());
    };

    const parseLocalDate = (dateStr: string) => {
        const [year, month, day] = dateStr.split("-").map(Number);
        return new Date(year, month - 1, day);
    };

    const isValidDateString = (dateStr: string): boolean => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
        const [year, month, day] = dateStr.split("-").map(Number);
        if (month < 1 || month > 12) return false;
        if (day < 1 || day > 31) return false;
        const date = new Date(year, month - 1, day);
        return (
            date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
        );
    };

    const getDiffDays = (dateStr: string) => {
        const expiry = parseLocalDate(dateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    };

    const getExpiryStatus = (dateStr: string) => {
        const diffDays = getDiffDays(dateStr);
        if (diffDays < 0)
            return {
                icon: <XCircle size={14} />,
                text: t("statusExpired"),
                color: "text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-900/30",
                key: "expired" as FilterStatus,
            };
        if (diffDays <= 30)
            return {
                icon: <AlertTriangle size={14} />,
                text: t("statusExpiringSoon", { days: diffDays }),
                color: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-900/30",
                key: "expiringSoon" as FilterStatus,
            };
        return {
            icon: <CheckCircle2 size={14} />,
            text: t("statusSafe"),
            color: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-900/30",
            key: "safe" as FilterStatus,
        };
    };

    // Export
    const handleExport = () => {
        const blob = new Blob([JSON.stringify(medicines, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "sahidawa_expiry_backup.json";
        a.click();
        URL.revokeObjectURL(url);
    };

    // Import
    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        setImportError(null);
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = JSON.parse(event.target?.result as string);
                if (!Array.isArray(parsed)) throw new Error("Not an array");
                const valid = parsed.filter(
                    (item) =>
                        typeof item.id === "string" &&
                        typeof item.name === "string" &&
                        typeof item.expiryDate === "string" &&
                        isValidDateString(item.expiryDate)
                );
                if (valid.length !== parsed.length) {
                    setImportError(t("importDateError"));
                    return;
                }
                const existingIds = new Set(medicines.map((m) => m.id));
                const merged = [...medicines, ...valid.filter((m) => !existingIds.has(m.id))];
                saveToLocalStorage(merged);
            } catch {
                setImportError(t("importError"));
            }
        };
        reader.readAsText(file);
        e.target.value = "";
    };

    // Filter + Search + Sort
    const processedMedicines = medicines
        .filter((med) => {
            if (filterStatus === "all") return true;
            return getExpiryStatus(med.expiryDate).key === filterStatus;
        })
        .filter((med) => med.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
            if (sortBy === "expirySoonest")
                return getDiffDays(a.expiryDate) - getDiffDays(b.expiryDate);
            if (sortBy === "expiryLatest")
                return getDiffDays(b.expiryDate) - getDiffDays(a.expiryDate);
            return a.name.localeCompare(b.name);
        });

    const filterOptions: { key: FilterStatus; label: string }[] = [
        { key: "all", label: t("filterAll") },
        { key: "expired", label: t("filterExpired") },
        { key: "expiringSoon", label: t("filterExpiringSoon") },
        { key: "safe", label: t("filterSafe") },
    ];

    return (
        <div className="min-h-screen bg-(--color-surface-page) text-(--color-text-primary) transition-colors duration-300">
            <PageHeader title={t("title")} subtitle={t("subtitle")} backHref="/" variant="light" />

            <main className="mx-auto max-w-6xl p-6 pt-32 md:pt-40">
                <div className="mt-4 grid grid-cols-1 gap-8 md:grid-cols-3">
                    {/* Sidebar */}
                    <div className="h-fit rounded-2xl border border-(--color-border-muted) bg-(--color-surface-muted) p-6 shadow-sm md:sticky md:top-32 md:col-span-1">
                        <h2 className="mb-4 text-lg font-bold tracking-tight uppercase">
                            {editingId ? t("editMedicine") : t("addMedicine")}
                        </h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-bold tracking-wider uppercase opacity-60">
                                    {t("name")}
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full rounded-xl border border-(--color-border-muted) bg-(--color-surface-page) p-3 text-(--color-text-primary) transition outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder={t("namePlaceholder")}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold tracking-wider uppercase opacity-60">
                                    {t("expiryDate")}
                                </label>

                                <input
                                    type="date"
                                    required
                                    value={expiryDate}
                                    onChange={(e) => {
                                        const value = e.target.value;

                                        setExpiryDate(value);
                                        setDateError("");

                                        if (value) {
                                            const selected = parseLocalDate(value);
                                            const today = new Date();

                                            today.setHours(0, 0, 0, 0);
                                            selected.setHours(0, 0, 0, 0);

                                            setIsExpired(selected < today);
                                        } else {
                                            setIsExpired(false);
                                        }
                                    }}
                                    className="w-full rounded-xl border border-(--color-border-muted) bg-(--color-surface-page) p-3 text-(--color-text-primary) [color-scheme:light] transition outline-none focus:ring-2 focus:ring-emerald-500 dark:[color-scheme:dark]"
                                />

                                {isExpired && (
                                    <p className="mt-1 text-sm text-amber-600">
                                        Warning: This medicine has already expired.
                                    </p>
                                )}

                                {dateError && (
                                    <p className="mt-1 text-sm text-red-600">{dateError}</p>
                                )}
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold tracking-wider uppercase opacity-60">
                                    {t("batchNumber")}
                                </label>
                                <input
                                    type="text"
                                    value={batchNumber}
                                    onChange={(e) => setBatchNumber(e.target.value)}
                                    className="w-full rounded-xl border border-(--color-border-muted) bg-(--color-surface-page) p-3 text-(--color-text-primary) transition outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder={t("batchPlaceholder")}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs font-bold tracking-wider uppercase opacity-60">
                                    {t("notesLabel")}
                                </label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={3}
                                    className="w-full resize-none rounded-xl border border-(--color-border-muted) bg-(--color-surface-page) p-3 text-(--color-text-primary) transition outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder={t("notesPlaceholder")}
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full rounded-xl bg-emerald-600 py-3 font-bold text-white shadow-lg shadow-emerald-900/20 transition-all hover:bg-emerald-700 active:scale-95"
                            >
                                {editingId ? t("saveChanges") : t("addToTracker")}
                            </button>
                            {editingId && (
                                <button
                                    type="button"
                                    onClick={cancelEdit}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-(--color-border-muted) py-3 font-bold transition hover:bg-(--color-surface-page)"
                                >
                                    <X size={18} /> {t("cancel")}
                                </button>
                            )}
                        </form>

                        {/* Import / Export */}
                        <div className="mt-6 flex flex-col gap-2">
                            <button
                                onClick={handleExport}
                                disabled={medicines.length === 0}
                                className="flex items-center justify-center gap-2 rounded-xl border border-(--color-border-muted) py-2.5 text-sm font-semibold transition hover:bg-(--color-surface-page) disabled:opacity-40"
                            >
                                <Download size={15} /> {t("exportBackup")}
                            </button>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center justify-center gap-2 rounded-xl border border-(--color-border-muted) py-2.5 text-sm font-semibold transition hover:bg-(--color-surface-page)"
                            >
                                <Upload size={15} /> {t("importBackup")}
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json"
                                onChange={handleImport}
                                className="hidden"
                            />
                            {importError && <p className="text-xs text-red-500">{importError}</p>}
                        </div>
                    </div>

                    {/* Main list */}
                    <div className="space-y-4 md:col-span-2">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-xl font-bold">{t("trackedMedicines")}</h2>
                            <div className="flex items-center gap-2">
                                {selectedIds.size > 0 && (
                                    <button
                                        onClick={handleBulkDelete}
                                        className="flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-xs font-bold text-red-500 transition hover:bg-red-500/20"
                                    >
                                        <Trash2 size={14} /> {t("deleteSelected")} (
                                        {selectedIds.size})
                                    </button>
                                )}
                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-500">
                                    {t("total")}: {medicines.length}
                                </span>
                            </div>
                        </div>

                        {/* Search + Sort */}
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <div className="relative flex-1">
                                <Search
                                    size={15}
                                    className="absolute top-1/2 left-3 -translate-y-1/2 opacity-40"
                                />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={t("searchPlaceholder")}
                                    className="w-full rounded-xl border border-(--color-border-muted) bg-(--color-surface-muted) py-2.5 pr-3 pl-9 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as SortOption)}
                                className="rounded-xl border border-(--color-border-muted) bg-(--color-surface-muted) px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                            >
                                <option value="expirySoonest">{t("sortExpirySoonest")}</option>
                                <option value="expiryLatest">{t("sortExpiryLatest")}</option>
                                <option value="alpha">{t("sortAlpha")}</option>
                            </select>
                        </div>

                        {/* Filter chips */}
                        <div className="flex flex-wrap gap-2">
                            {filterOptions.map((f) => (
                                <button
                                    key={f.key}
                                    onClick={() => setFilterStatus(f.key)}
                                    className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-all ${
                                        filterStatus === f.key
                                            ? "border-emerald-600 bg-emerald-600 text-white"
                                            : "border-(--color-border-muted) text-(--color-text-secondary) hover:border-emerald-500"
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>

                        {!isLoaded ? (
                            <div className="py-20 text-center opacity-50">
                                <p className="animate-pulse">{t("loading")}</p>
                            </div>
                        ) : processedMedicines.length === 0 ? (
                            <div className="rounded-3xl border-2 border-dashed border-(--color-border-muted) bg-(--color-surface-muted) py-20 text-center opacity-50">
                                <Package size={48} className="mx-auto mb-2 opacity-50" />
                                <p>{t("noMedicines")}</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {processedMedicines.map((med) => {
                                    const status = getExpiryStatus(med.expiryDate);
                                    return (
                                        <div
                                            key={med.id}
                                            className="flex items-center justify-between rounded-2xl border border-(--color-border-muted) bg-(--color-surface-muted) p-5 shadow-sm transition-all hover:border-emerald-500/50"
                                        >
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(med.id)}
                                                    onChange={() => toggleSelect(med.id)}
                                                    aria-label={t("selectMedicine", {
                                                        name: med.name,
                                                    })}
                                                    className="h-4 w-4 cursor-pointer accent-emerald-600"
                                                />
                                                <div className="space-y-1">
                                                    <h3 className="text-lg leading-tight font-bold">
                                                        {med.name}
                                                    </h3>
                                                    <div className="flex items-center gap-3 text-sm opacity-70">
                                                        <span className="flex items-center gap-1">
                                                            <Calendar size={14} />{" "}
                                                            {parseLocalDate(
                                                                med.expiryDate
                                                            ).toLocaleDateString()}
                                                        </span>
                                                        {med.batchNumber && (
                                                            <span className="flex items-center gap-1">
                                                                <Package size={14} />{" "}
                                                                {med.batchNumber}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {med.notes && (
                                                        <p className="mt-2 border-l-2 border-emerald-500/30 pl-2 text-sm italic opacity-60">
                                                            {med.notes}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span
                                                    className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[11px] font-bold ${status.color}`}
                                                >
                                                    {status.icon} {status.text}
                                                </span>
                                                <button
                                                    onClick={() => startEdit(med)}
                                                    className="rounded-full p-2 transition-colors hover:bg-emerald-500/10"
                                                >
                                                    <Pencil
                                                        size={18}
                                                        className="text-emerald-500"
                                                    />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(med.id)}
                                                    className="rounded-full p-2 transition-colors hover:bg-red-500/10"
                                                >
                                                    <Trash2 size={18} className="text-red-500" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
