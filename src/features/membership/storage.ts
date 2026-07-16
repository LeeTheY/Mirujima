import type { SupportedStorage } from "@supabase/supabase-js";
import { STORAGE_KEYS } from "../../shared/constants";
import { FREE_MEMBERSHIP, normalizeMembershipSnapshot, type MembershipSnapshot } from "./types";

function area(): chrome.storage.StorageArea {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    throw new Error("Chrome 저장소를 사용할 수 없습니다.");
  }
  return chrome.storage.local;
}

export const trustedSupabaseStorage: SupportedStorage = {
  async getItem(key) {
    const values = await area().get(key);
    return typeof values[key] === "string" ? values[key] : null;
  },
  async setItem(key, value) {
    await area().set({ [key]: value });
  },
  async removeItem(key) {
    await area().remove(key);
  }
};

export async function protectMembershipStorage(): Promise<void> {
  if (chrome.storage.local.setAccessLevel) {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  }
}

export async function getMembershipCache(): Promise<MembershipSnapshot> {
  const values = await area().get(STORAGE_KEYS.membershipCache);
  const value = values[STORAGE_KEYS.membershipCache];
  return normalizeMembershipSnapshot(value);
}

export async function setMembershipCache(value: MembershipSnapshot): Promise<void> {
  await area().set({ [STORAGE_KEYS.membershipCache]: value });
}

export async function hasStoredSupabaseSession(): Promise<boolean> {
  const values = await area().get(null);
  return Object.keys(values).some((key) => key.startsWith("mirujima:supabase-auth-token"));
}

export async function clearMembershipAccountData(): Promise<void> {
  const values = await area().get(null);
  const authKeys = Object.keys(values).filter((key) => key.startsWith("mirujima:supabase-auth-token"));
  if (authKeys.length) await area().remove(authKeys);
  await setMembershipCache(FREE_MEMBERSHIP);
}

export async function getOrCreateDeviceId(): Promise<string> {
  const values = await area().get(STORAGE_KEYS.membershipDeviceId);
  const current = values[STORAGE_KEYS.membershipDeviceId];
  if (typeof current === "string" && current) return current;
  const id = crypto.randomUUID();
  await area().set({ [STORAGE_KEYS.membershipDeviceId]: id });
  return id;
}
