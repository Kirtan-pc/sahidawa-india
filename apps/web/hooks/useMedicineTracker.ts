/**
 * useMedicineTracker.ts
 * Custom hook that owns all medicine CRUD state and data-persistence logic.
 *
 * Auth path  → reads/writes to Supabase table `expiry_tracker_items`
 * Guest path → reads/writes to localStorage key `sahidawa_expiry_tracker`
 */
"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Medicine {
    id: string;
    name: string;
    expiryDate: string;
    batchNumber?: string;
}

export interface AddMedicineFields {
    name: string;
    expiryDate: string;
    batchNumber: string;
}

export interface UseMedicineTrackerReturn {
    medicines: Medicine[];
    userId: string | null;
    isLoaded: boolean;
    addMedicine: (fields: AddMedicineFields) => Promise<void>;
    deleteMedicine: (id: string) => Promise<void>;
    /** Replaces the entire medicine list (used by the import flow). */
    replaceMedicines: (list: Medicine[]) => void;
}

// ─── Local-storage helpers ────────────────────────────────────────────────────

const LS_KEY = "sahidawa_expiry_tracker";

function lsRead(): Medicine[] {
    try {
        if (typeof window === "undefined") return [];
        const raw = window.localStorage.getItem(LS_KEY);
        return raw ? (JSON.parse(raw) as Medicine[]) : [];
    } catch {
        return [];
    }
}

function lsWrite(list: Medicine[]): void {
    try {
        if (typeof window !== "undefined") {
            window.localStorage.setItem(LS_KEY, JSON.stringify(list));
        }
    } catch (e) {
        console.error("Failed to save medicines to localStorage:", e);
    }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMedicineTracker(): UseMedicineTrackerReturn {
    const [medicines, setMedicines] = useState<Medicine[]>([]);
    const [userId, setUserId] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    // ── Initial load ──────────────────────────────────────────────────────────
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
                        setMedicines(
                            data.map((item) => ({
                                id: item.id as string,
                                name: item.brand_name as string,
                                expiryDate: item.expiry_date as string,
                                batchNumber: (item.batch_number as string) ?? "",
                            }))
                        );
                    }
                } else {
                    setMedicines(lsRead());
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoaded(true);
            }
        };

        loadData();
    }, []);

    // ── Add ───────────────────────────────────────────────────────────────────
    const addMedicine = useCallback(
        async ({ name, expiryDate, batchNumber }: AddMedicineFields) => {
            if (userId) {
                const { data, error } = await supabase
                    .from("expiry_tracker_items")
                    .insert({
                        user_id: userId,
                        brand_name: name,
                        batch_number: batchNumber || null,
                        expiry_date: expiryDate,
                    })
                    .select()
                    .single();

                if (!error && data) {
                    setMedicines((prev) => [
                        ...prev,
                        {
                            id: data.id as string,
                            name: data.brand_name as string,
                            expiryDate: data.expiry_date as string,
                            batchNumber: (data.batch_number as string) ?? "",
                        },
                    ]);
                }
            } else {
                const newMed: Medicine = {
                    id: Date.now().toString(),
                    name,
                    expiryDate,
                    batchNumber,
                };
                setMedicines((prev) => {
                    const updated = [...prev, newMed];
                    lsWrite(updated);
                    return updated;
                });
            }
        },
        [userId]
    );

    // ── Delete ────────────────────────────────────────────────────────────────
    const deleteMedicine = useCallback(
        async (id: string) => {
            if (userId) {
                await supabase.from("expiry_tracker_items").delete().eq("id", id);
                setMedicines((prev) => prev.filter((m) => m.id !== id));
            } else {
                setMedicines((prev) => {
                    const updated = prev.filter((m) => m.id !== id);
                    lsWrite(updated);
                    return updated;
                });
            }
        },
        [userId]
    );

    // ── Replace (used by import) ───────────────────────────────────────────────
    const replaceMedicines = useCallback((list: Medicine[]) => {
        setMedicines(list);
        lsWrite(list);
    }, []);

    return { medicines, userId, isLoaded, addMedicine, deleteMedicine, replaceMedicines };
}
