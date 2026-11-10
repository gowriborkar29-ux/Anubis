# Cross-device history sync setup

The calculator encrypts each history entry in the browser before sending it to Supabase. Supabase stores only encrypted entries and a random salt; it never receives the history passphrase or a decryption key. Use the same history passphrase on every device. If you forget it, the synced history cannot be recovered.

## 1. Create the Supabase database

1. Create a Supabase project in the [Supabase dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor**, paste in [`supabase-setup.sql`](./supabase-setup.sql), and run it.
3. In **Project Settings → API**, copy the Project URL and the **publishable** key (or legacy `anon` key). Do not use or publish a `service_role` or secret key.
4. Put those two values in [`supabase-config.js`](./supabase-config.js):

   ```js
   window.CALCULATOR_SUPABASE_CONFIG = {
     url: 'https://your-project-ref.supabase.co',
     publishableKey: 'your-public-publishable-key'
   };
   ```

The publishable key is intended for browser apps. The SQL enables row-level security so each signed-in user can access only their own rows. Never add a service-role key to this site.

## 2. Configure GitHub sign-in

1. In Supabase, open **Authentication → Sign In / Providers → GitHub** and copy the callback URL shown there.
2. Create a GitHub OAuth App under [GitHub Developer settings](https://github.com/settings/developers). Set its homepage URL to `https://gowriborkar29-ux.github.io/calci2/` and its authorization callback URL to the Supabase callback URL.
3. Copy the GitHub OAuth app's client ID and generate a client secret. Enter both in the Supabase GitHub provider settings, then enable and save the provider. Keep the client secret in Supabase; do not put it in this repository.
4. In Supabase **Authentication → URL Configuration**, set the site URL to `https://gowriborkar29-ux.github.io/calci2/` and add that same URL to the allowed redirect URLs.

## 3. Deploy and use sync

Commit and push `supabase-config.js` after filling in the project URL and publishable key. GitHub Pages will deploy the configuration with the site. Select **Sync with GitHub** in the history dialog (or in the history panel after dismissing the dialog) on each device, authorize the same GitHub account, then unlock the history with the same passphrase. Each account has an isolated history vault.

The passphrase is never saved. Lock history when finished. Clearing history while unlocked clears synced entries for that account as well as local history on all devices.
