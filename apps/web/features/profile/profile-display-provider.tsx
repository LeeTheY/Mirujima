"use client";

import { createContext, useContext, type ReactNode } from "react";
import { resolveMembershipStatus, type MembershipStatusView } from "@/features/membership/membership-status";
import type { WalletSummary } from "@/features/wallet/wallet-data";

interface ProfileContextValue {
  displayName: string;
  hasActiveGuardian: boolean;
  membershipStatus: MembershipStatusView;
  walletSummary: WalletSummary;
}

const ProfileContext = createContext<ProfileContextValue>({
  displayName: "이름 미설정",
  hasActiveGuardian: false,
  membershipStatus: resolveMembershipStatus(null),
  walletSummary: {
    topupAvailable: 0,
    earnedAvailable: 0,
    reservedAvailable: 0,
    cashoutReserved: 0,
    cashoutCompleted: 0,
    guardianRewardCompleted: 0,
  },
});

export function ProfileDisplayNameProvider({
  displayName,
  hasActiveGuardian,
  membershipStatus,
  walletSummary,
  children,
}: {
  displayName: string;
  hasActiveGuardian: boolean;
  membershipStatus: MembershipStatusView;
  walletSummary: WalletSummary;
  children: ReactNode;
}) {
  return <ProfileContext.Provider value={{ displayName, hasActiveGuardian, membershipStatus, walletSummary }}>{children}</ProfileContext.Provider>;
}

export function useProfileDisplayName(): string {
  return useContext(ProfileContext).displayName;
}

export function useStudentHasActiveGuardian(): boolean {
  return useContext(ProfileContext).hasActiveGuardian;
}

export function useMembershipStatus(): MembershipStatusView {
  return useContext(ProfileContext).membershipStatus;
}

export function useWalletSummary(): WalletSummary {
  return useContext(ProfileContext).walletSummary;
}
