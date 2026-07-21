import fs from "fs";
import path from "path";
import logger from "../utils/logger";
import { supabase, dbConfig } from "../db/client";

export interface InMemorySubscriber {
    id: string;
    user_id: string | null;
    phone: string;
    channels: ("sms" | "whatsapp")[];
    language: string;
    district: string;
    is_active: boolean;
    status: string;
    verification_otp: string | null;
    otp_expires_at: string | null;
    created_at: string;
    updated_at: string;
}

const DATA_FILE = path.resolve(process.cwd(), "data", "memory-subscribers.json");
const SAVE_DEBOUNCE_MS = 2_000;

class PersistedMemorySubscriberStore {
    private store = new Map<string, InMemorySubscriber>();
    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private dirty = false;

    constructor() {
        this.load();
        this.startPeriodicSave();
        this.startReconciliation();
    }

    private load(): void {
        try {
            const filePath = DATA_FILE;
            if (fs.existsSync(filePath)) {
                const raw = fs.readFileSync(filePath, "utf-8");
                const data: InMemorySubscriber[] = JSON.parse(raw);
                for (const sub of data) {
                    this.store.set(sub.phone, sub);
                }
                logger.info(
                    `Loaded ${data.length} in-memory subscribers from ${filePath}`
                );
            } else {
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                logger.info("No existing memory subscriber file found, starting fresh");
            }
        } catch (err) {
            logger.error({
                message: "Failed to load memory subscribers from file",
                error: err,
            });
        }
    }

    private save(): void {
        try {
            const filePath = DATA_FILE;
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            const data = Array.from(this.store.values());
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
        } catch (err) {
            logger.error({
                message: "Failed to save memory subscribers to file",
                error: err,
            });
        }
    }

    private debouncedSave(): void {
        this.dirty = true;
        if (!this.saveTimer) {
            this.saveTimer = setTimeout(() => {
                this.saveTimer = null;
                if (this.dirty) {
                    this.dirty = false;
                    this.save();
                }
            }, SAVE_DEBOUNCE_MS);
        }
    }

    private startPeriodicSave(): void {
        setInterval(() => {
            if (this.dirty) {
                this.dirty = false;
                this.save();
            }
        }, 30_000);
    }

    get(phone: string): InMemorySubscriber | undefined {
        return this.store.get(phone);
    }

    set(phone: string, subscriber: InMemorySubscriber): void {
        this.store.set(phone, subscriber);
        this.debouncedSave();
    }

    delete(phone: string): boolean {
        const result = this.store.delete(phone);
        if (result) this.debouncedSave();
        return result;
    }

    find(
        predicate: (sub: InMemorySubscriber) => boolean
    ): InMemorySubscriber | undefined {
        for (const sub of this.store.values()) {
            if (predicate(sub)) return sub;
        }
        return undefined;
    }

    values(): IterableIterator<InMemorySubscriber> {
        return this.store.values();
    }

    size(): number {
        return this.store.size;
    }

    clear(): void {
        this.store.clear();
        this.debouncedSave();
    }

    getAll(): InMemorySubscriber[] {
        return Array.from(this.store.values());
    }

    async reconcileWithSupabase(): Promise<void> {
        const subscribers = this.getAll();
        if (subscribers.length === 0) return;

        logger.info(
            `Attempting to reconcile ${subscribers.length} subscribers to Supabase...`
        );

        let reconciled = 0;
        let failed = 0;

        for (const sub of subscribers) {
            try {
                const { data: existing } = await supabase
                    .from("notification_subscribers")
                    .select("id")
                    .eq("phone", sub.phone)
                    .maybeSingle();

                const payload = {
                    user_id: sub.user_id,
                    phone: sub.phone,
                    channels: sub.channels,
                    language: sub.language,
                    district: sub.district,
                    is_active: sub.is_active,
                    status: sub.status,
                    verification_otp: sub.verification_otp,
                    otp_expires_at: sub.otp_expires_at,
                };

                let error;
                if (existing) {
                    const { error: updateError } = await supabase
                        .from("notification_subscribers")
                        .update(payload)
                        .eq("id", existing.id);
                    error = updateError;
                } else {
                    const { error: insertError } = await supabase
                        .from("notification_subscribers")
                        .insert(payload);
                    error = insertError;
                }

                if (error) {
                    logger.warn({
                        message: `Failed to reconcile subscriber ${sub.phone}`,
                        error,
                    });
                    failed++;
                } else {
                    reconciled++;
                    this.store.delete(sub.phone);
                }
            } catch (err) {
                logger.warn({
                    message: `Exception reconciling subscriber ${sub.phone}`,
                    error: err,
                });
                failed++;
            }
        }

        if (reconciled > 0) {
            this.dirty = true;
            this.save();
            logger.info(
                `Reconciled ${reconciled} subscribers to Supabase, ${failed} failed`
            );
        }
    }

    private startReconciliation(): void {
        setInterval(async () => {
            if (!dbConfig?.isSupabaseOffline && this.store.size > 0) {
                await this.reconcileWithSupabase();
            }
        }, 30_000);
    }

    saveImmediate(): void {
        this.dirty = false;
        this.save();
    }
}

export const memorySubscriberStore = new PersistedMemorySubscriberStore();
