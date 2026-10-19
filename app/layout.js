import './globals.css';
import AppShell from './AppShell';
import { LanguageProvider } from './i18n/LanguageProvider';

export const metadata = {
  title: 'HR Portal',
  description: 'HR management portal for project codes and staff',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <AppShell>{children}</AppShell>
        </LanguageProvider>
      </body>
    </html>
  );
}
