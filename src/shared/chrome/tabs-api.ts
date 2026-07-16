export interface TabsApi {
  queryCurrentWindow(): Promise<chrome.tabs.Tab[]>;
  queryGroups(windowId: number): Promise<chrome.tabGroups.TabGroup[]>;
  group(tabIds: number[], groupId?: number): Promise<number>;
  ungroup(tabId: number): Promise<void>;
  updateGroup(groupId: number, changes: chrome.tabGroups.UpdateProperties): Promise<chrome.tabGroups.TabGroup | undefined>;
  move(tabId: number, index: number): Promise<chrome.tabs.Tab | chrome.tabs.Tab[]>;
  updateTab(tabId: number, changes: chrome.tabs.UpdateProperties): Promise<chrome.tabs.Tab | undefined>;
  getTab(tabId: number): Promise<chrome.tabs.Tab>;
}

export const tabsApi: TabsApi = {
  queryCurrentWindow: () => chrome.tabs.query({ currentWindow: true }),
  queryGroups: (windowId) => chrome.tabGroups.query({ windowId }),
  group: (tabIds, groupId) => {
    const [first, ...rest] = tabIds;
    if (first === undefined) return Promise.reject(new Error("그룹화할 탭이 없습니다."));
    const selected: [number, ...number[]] = [first, ...rest];
    return chrome.tabs.group(groupId === undefined ? { tabIds: selected } : { tabIds: selected, groupId });
  },
  ungroup: (tabId) => chrome.tabs.ungroup(tabId),
  updateGroup: (groupId, changes) => chrome.tabGroups.update(groupId, changes),
  move: (tabId, index) => chrome.tabs.move(tabId, { index }),
  updateTab: (tabId, changes) => chrome.tabs.update(tabId, changes),
  getTab: (tabId) => chrome.tabs.get(tabId)
};
