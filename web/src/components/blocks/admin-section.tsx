import * as React from 'react';
import { formatDateTime, type Locale, type TranslateFn } from '@/i18n';
import type { AdminSectionId, AdminSettings, CookiesStatus } from '@/types/api';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { FilePicker } from '@/components/ui/file-picker';
import { Icon } from '@/components/ui/icon';
import { SectionHeader } from '@/components/ui/section-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SidebarNav, type SidebarNavItem } from '@/components/ui/sidebar-nav';
import { Textarea } from '@/components/ui/textarea';

const EVERYONE_VALUE = '__everyone__';
const ALL_CHANNELS_VALUE = '__all_channels__';

export interface AdminSectionProps {
  activeSection: AdminSectionId;
  settings: AdminSettings | null;
  canManageCookies: boolean;
  cookiesStatus: CookiesStatus | null;
  isSavingAccess: boolean;
  isApplyingCookies: boolean;
  isReloadingCookies: boolean;
  locale: Locale;
  t: TranslateFn;
  onSelectSection: (section: AdminSectionId) => void;
  onSaveAccessSettings: (payload: {
    requiredRoleId: string | null;
    allowedChannelId: string | null;
  }) => void;
  onApplyCookies: (content: string) => Promise<boolean>;
  onReloadCookies: () => void;
  onClearCookies: () => void;
  onCookiesFileError: (code: 'too_large' | 'read_error') => void;
  onCookiesFileLoaded: () => void;
}

export function AdminSection({
  activeSection,
  settings,
  canManageCookies,
  cookiesStatus,
  isSavingAccess,
  isApplyingCookies,
  isReloadingCookies,
  locale,
  t,
  onSelectSection,
  onSaveAccessSettings,
  onApplyCookies,
  onReloadCookies,
  onClearCookies,
  onCookiesFileError,
  onCookiesFileLoaded,
}: AdminSectionProps) {
  const [selectedRole, setSelectedRole] = React.useState<string>(
    settings?.requiredRoleId ?? EVERYONE_VALUE
  );
  const [selectedChannel, setSelectedChannel] = React.useState<string>(
    settings?.allowedChannelId ?? ALL_CHANNELS_VALUE
  );
  const [cookiesText, setCookiesText] = React.useState('');
  const [cookiesFileName, setCookiesFileName] = React.useState<string | null>(null);
  const [pickerKey, setPickerKey] = React.useState(0);

  React.useEffect(() => {
    setSelectedRole(settings?.requiredRoleId ?? EVERYONE_VALUE);
  }, [settings?.requiredRoleId]);

  React.useEffect(() => {
    setSelectedChannel(settings?.allowedChannelId ?? ALL_CHANNELS_VALUE);
  }, [settings?.allowedChannelId]);

  const navItems: SidebarNavItem<AdminSectionId>[] = [
    { id: 'access', label: t('admin.navAccess'), icon: 'shield' },
  ];
  if (canManageCookies) {
    navItems.push({ id: 'cookies', label: t('admin.navCookies'), icon: 'cookie' });
  }

  const effectiveSection: AdminSectionId =
    activeSection === 'cookies' && !canManageCookies ? 'access' : activeSection;

  const handleAccessSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveAccessSettings({
      requiredRoleId: selectedRole === EVERYONE_VALUE ? null : selectedRole,
      allowedChannelId: selectedChannel === ALL_CHANNELS_VALUE ? null : selectedChannel,
    });
  };

  const handleCookiesFileSelect = async (file: File | null) => {
    if (!file) return;
    if (file.size > 256 * 1024) {
      setPickerKey((k) => k + 1);
      onCookiesFileError('too_large');
      return;
    }
    try {
      const content = await file.text();
      setCookiesFileName(file.name);
      setCookiesText(content);
      onCookiesFileLoaded();
    } catch {
      onCookiesFileError('read_error');
    }
  };

  const handleApplyCookies = async () => {
    const ok = await onApplyCookies(cookiesText.trim());
    if (ok) {
      setCookiesText('');
      setCookiesFileName(null);
      setPickerKey((k) => k + 1);
    }
  };

  const renderCookiesStatusAlert = () => {
    if (!cookiesStatus) {
      return <Alert variant="info">{t('admin.cookiesStatusLoading')}</Alert>;
    }
    if (cookiesStatus.hasCookies) {
      if (cookiesStatus.source === 'file') {
        const message = cookiesStatus.updatedAt
          ? t('admin.cookiesStatusFileUpdated', {
              count: cookiesStatus.lineCount,
              date: formatDateTime(locale, cookiesStatus.updatedAt),
            })
          : t('admin.cookiesStatusFile', { count: cookiesStatus.lineCount });
        return <Alert variant="success">{message}</Alert>;
      }
      return <Alert variant="success">{t('admin.cookiesStatusEnv')}</Alert>;
    }
    return <Alert variant="warning">{t('admin.cookiesStatusEmpty')}</Alert>;
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <SidebarNav
        title={t('admin.navTitle')}
        items={navItems}
        activeId={effectiveSection}
        onSelect={onSelectSection}
        className="md:w-60 md:shrink-0"
      />

      <div className="min-w-0 flex-1">
        {effectiveSection === 'access' && (
          <Card>
            <CardHeader className="border-b border-border pb-3">
              <SectionHeader
                title={t('admin.accessTitle')}
                description={t('admin.accessDescription')}
              />
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleAccessSubmit} className="max-w-md space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-fg-secondary">
                    {t('admin.roleLabel')}
                  </label>
                  <Select value={selectedRole} onValueChange={setSelectedRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={EVERYONE_VALUE}>{t('admin.roleEveryone')}</SelectItem>
                      {(settings?.roles ?? []).map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          @{role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-fg-secondary">
                    {t('admin.channelLabel')}
                  </label>
                  <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_CHANNELS_VALUE}>{t('admin.channelAll')}</SelectItem>
                      {(settings?.channels ?? []).map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>
                          #{channel.name}
                          {channel.parentName ? ` (${channel.parentName})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit" variant="primary" disabled={isSavingAccess}>
                  <Icon name="save" size="sm" />
                  <span>{t('admin.saveSettings')}</span>
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {effectiveSection === 'cookies' && canManageCookies && (
          <Card>
            <CardHeader className="border-b border-border pb-3">
              <SectionHeader
                title={t('admin.cookiesTitle')}
                description={t('admin.cookiesDescription')}
              />
            </CardHeader>
            <CardContent className="space-y-3.5 pt-4">
              {renderCookiesStatusAlert()}

              <div>
                <FilePicker
                  key={pickerKey}
                  accept=".txt,text/plain"
                  label={t('admin.cookiesPickFile')}
                  fileName={cookiesFileName}
                  icon="file-text"
                  disabled={isApplyingCookies}
                  onFileSelect={handleCookiesFileSelect}
                />
              </div>

              <Textarea
                rows={6}
                value={cookiesText}
                disabled={isApplyingCookies}
                placeholder={t('admin.cookiesPlaceholder')}
                onChange={(e) => setCookiesText(e.target.value)}
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  disabled={isApplyingCookies}
                  onClick={handleApplyCookies}
                >
                  <Icon name="save" size="sm" />
                  <span>
                    {isApplyingCookies ? t('admin.cookiesApplying') : t('admin.cookiesApply')}
                  </span>
                </Button>
                <Button
                  variant="secondary"
                  disabled={isReloadingCookies}
                  onClick={onReloadCookies}
                >
                  <Icon name="refresh-cw" size="sm" />
                  <span>{t('admin.cookiesReload')}</span>
                </Button>
                <Button variant="danger" onClick={onClearCookies}>
                  <Icon name="trash" size="sm" />
                  <span>{t('admin.cookiesClear')}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
