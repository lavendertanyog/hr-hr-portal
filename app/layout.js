import './globals.css';
import AppShell from './AppShell';

export const metadata = {
  title: 'HR Portal',
  description: 'HR management portal for project codes and staff',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
