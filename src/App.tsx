/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Layout } from './components/Layout';
import { LoginScreen } from './auth/LoginScreen';
import { useAuth } from './auth/useAuth';
import { useEffect } from 'react';
import { useTheme } from './store/useTheme';
import { applyThemeMode } from './utils/theme';

export default function App() {
  const unlocked = useAuth((s) => s.unlocked);
  const themeMode = useTheme((s) => s.mode);
  const presentationMode = new URLSearchParams(window.location.search).get('presentation') === '1';
  const localDemoMode = import.meta.env.DEV || presentationMode;

  useEffect(() => {
    applyThemeMode(themeMode);
  }, [themeMode]);

  // The local demo and presentation links intentionally skip the profile
  // picker. This keeps a live pitch focused on the product, not a login step.
  useEffect(() => {
    if (localDemoMode && !unlocked) {
      useAuth.setState({
        currentUserId: 'u-owner',
        currentUserName: 'Eigenaar',
        currentRole: 'owner',
        unlocked: true,
      });
    }
  }, [localDemoMode, unlocked]);

  return unlocked || localDemoMode ? <Layout /> : <LoginScreen />;
}
