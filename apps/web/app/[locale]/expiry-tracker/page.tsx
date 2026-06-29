"use client";
import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "../components/PageHeader";
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
} from "lucide-react";
import { useMedicineTracker } from "@/hooks/useMedicineTracker";
import { useExpiryIO } from "@/hooks/useExpiryIO";
import { parseLocalDate, getDiffDays, getExpiryStatus } from "./components/expiryUtils";

type FilterStatus = "all" | "expired" | "expiringSoon" | "safe";
type SortOption = "expirySoonest" | "expiryLatest" | "alpha";

export default function ExpiryTrackerPage() {
    const t = useTranslations("ExpiryTracker");

    // ── Data / CRUD ───────────────────────────────────────────────────────────
    const { medicines, isLoaded, addMedicine, deleteMedicine, replaceMedicines } =
        useMedicineTracker();

    // ── I/O ───────────────────────────────────────────────────────────────────
    const { importError, fileInputRef, handleExport, handleImport } = useExpiryIO(
        medicines,
        replaceMedicines,
        { importError: t("importError"), importDateError: t("importDateError") }
    );

    // ── Form state ────────────────────────────────────────────────────────────
    const [name, setName] = useState("");
    const [expiryDate, setExpiryDate] = useState("");
    const [batchNumber, setBatchNumber] = useState("");

    // ── List UI state ─────────────────────────────────────────────────────────
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<SortOption>("expirySoonest");
    const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

    // ── Form submit ───────────────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !expiryDate) return;
        await addMedicine({ name, expiryDate, batchNumber });
        setName("");
        setExpiryDate("");
        setBatchNumber("");
    };

    // ── Derived list ──────────────────────────────────────────────────────────
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

    // ── Status → icon/color (render layer, not the pure util) ─────────────────
    const statusMeta: Record<
        "expired" | "expiringSoon" | "safe",
        { icon: React.ReactNode; color: string; text: string }
    > = {
        expired: {
            icon: <XCircle size={14} />,
            color: "text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-900/30",
            text: t("statusExpired"),
        },
        expiringSoon: {
            icon: <AlertTriangle size={14} />,
            color: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-900/30",
            // Overridden in render with interpolated days value
            text: "",
        },
        safe: {
            icon: <CheckCircle2 size={14} />,
            color: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-900/30",
            text: t("statusSafe"),
        },
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-(--color-surface-page) text-(--color-text-primary) transition-colors duration-300">
            <PageHeader title={t("title")} subtitle={t("subtitle")} backHref="/" variant="light" />

            <main className="mx-auto max-w-6xl p-6 pt-32 md:pt-40">
                <div className="mt-4 grid grid-cols-1 gap-8 md:grid-cols-3">
                    {/* ── Sidebar ── */}
                    <div className="h-fit rounded-2xl border border-(--color-border-muted) bg-(--color-surface-muted) p-6 shadow-sm md:sticky md:top-32 md:col-span-1">
                        <h2 className="mb-4 text-lg font-bold tracking-tight uppercase">
                            {t("addMedicine")}
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
                                    onChange={(e) => setExpiryDate(e.target.value)}
                                    className="w-full rounded-xl border border-(--color-border-muted) bg-(--color-surface-page) p-3 text-(--color-text-primary) [color-scheme:light] transition outline-none focus:ring-2 focus:ring-emerald-500 dark:[color-scheme:dark]"
                                />
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
                            <button
                                type="submit"
                                className="w-full rounded-xl bg-emerald-600 py-3 font-bold text-white shadow-lg shadow-emerald-900/20 transition-all hover:bg-emerald-700 active:scale-95"
                            >
                                {t("addToTracker")}
                            </button>
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

                    {/* ── Main list ── */}
                    <div className="space-y-4 md:col-span-2">
                        <div className="flex items-center justify-between px-2">
                            <h2 className="text-xl font-bold">{t("trackedMedicines")}</h2>
                            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-500">
                                {t("total")}: {medicines.length}
                            </span>
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

                        {/* Medicine list */}
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
                                    const { key, diffDays } = getExpiryStatus(med.expiryDate);
                                    const meta = statusMeta[key];
                                    const statusText =
                                        key === "expiringSoon"
                                            ? t("statusExpiringSoon", { days: diffDays })
                                            : meta.text;
                                    return (
                                        <div
                                            key={med.id}
                                            className="flex items-center justify-between rounded-2xl border border-(--color-border-muted) bg-(--color-surface-muted) p-5 shadow-sm transition-all hover:border-emerald-500/50"
                                        >
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
                                                            <Package size={14} /> {med.batchNumber}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span
                                                    className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[11px] font-bold ${meta.color}`}
                                                >
                                                    {meta.icon} {statusText}
                                                </span>
                                                <button
                                                    onClick={() => deleteMedicine(med.id)}
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
