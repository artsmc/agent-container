'use client';

import { useState } from 'react';
import type { SettingsTabId, SettingsTab } from '../../types';
import { AsanaWorkspacesTab } from '../AsanaWorkspacesTab';
import { UsersRolesTab } from '../UsersRolesTab';
import { EmailConfigTab } from '../EmailConfigTab';
import { AuditLogTab } from '../AuditLogTab';
import styles from './SettingsTabs.module.scss';

const ADMIN_TABS: SettingsTab[] = [
  { id: 'asana', label: 'Asana Workspaces' },
  { id: 'users', label: 'Users & Roles' },
  { id: 'email', label: 'Email Config' },
  { id: 'audit', label: 'Audit Log' },
];

const ACCOUNT_MANAGER_TABS: SettingsTab[] = [
  { id: 'audit', label: 'Audit Log' },
];

interface SettingsTabsProps {
  userRole: 'admin' | 'account_manager';
  userId: string;
}

/**
 * SettingsTabs -- Tab navigation for admin settings.
 *
 * Admin users see all 4 tabs. Account managers see only the Audit Log tab.
 * Tab components are conditionally rendered (not hidden) so inactive tabs
 * do not fetch data or consume resources.
 */
export function SettingsTabs({ userRole, userId }: SettingsTabsProps) {
  const tabs = userRole === 'admin' ? ADMIN_TABS : ACCOUNT_MANAGER_TABS;
  const [activeTab, setActiveTab] = useState<SettingsTabId>(tabs[0].id);

  return (
    <div className={styles.container} data-testid="settings-tabs">
      <nav className={styles.tabNav} role="tablist" aria-label="Settings">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            className={`${styles.tab} ${activeTab === tab.id ? styles.active : ''}`}
            onClick={() => setActiveTab(tab.id)}
            data-testid={`tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className={styles.tabContent}>
        {activeTab === 'asana' && userRole === 'admin' && (
          <div
            role="tabpanel"
            id="panel-asana"
            aria-labelledby="tab-asana"
            data-testid="panel-asana"
          >
            <AsanaWorkspacesTab />
          </div>
        )}
        {activeTab === 'users' && userRole === 'admin' && (
          <div
            role="tabpanel"
            id="panel-users"
            aria-labelledby="tab-users"
            data-testid="panel-users"
          >
            <UsersRolesTab currentUserId={userId} />
          </div>
        )}
        {activeTab === 'email' && userRole === 'admin' && (
          <div
            role="tabpanel"
            id="panel-email"
            aria-labelledby="tab-email"
            data-testid="panel-email"
          >
            <EmailConfigTab />
          </div>
        )}
        {activeTab === 'audit' && (
          <div
            role="tabpanel"
            id="panel-audit"
            aria-labelledby="tab-audit"
            data-testid="panel-audit"
          >
            <AuditLogTab userRole={userRole} />
          </div>
        )}
      </div>
    </div>
  );
}
