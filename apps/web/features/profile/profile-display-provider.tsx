"use client";

import { createContext, useContext, type ReactNode } from "react";

const ProfileDisplayNameContext = createContext("이름 미설정");

export function ProfileDisplayNameProvider({ displayName, children }: { displayName: string; children: ReactNode }) {
  return <ProfileDisplayNameContext.Provider value={displayName}>{children}</ProfileDisplayNameContext.Provider>;
}

export function useProfileDisplayName(): string {
  return useContext(ProfileDisplayNameContext);
}
