import React, { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { formatInr, timeAgo } from '../lib/format';
import { repo } from '../lib/repo';
import { Poll, PurchaseUpdate } from '../lib/types';
import { LIMITS, parsePrice } from '../lib/validation';
import { Banner, Button, Field } from './kit';
import { colors, type } from './theme';

export const AFFILIATE_DISCLOSURE = 'Affiliate link: the author may earn a commission if you buy through it.';

function UpdateCard({ poll, update }: { poll: Poll; update: PurchaseUpdate }) {
  const bought = update.status === 'bought';
  const diff = bought && update.pricePaidInr !== null ? poll.priceInr - update.pricePaidInr : 0;
  return (
    <View testID="update-card" style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 8, borderWidth: 2, borderColor: bought ? colors.buy : colors.skip }}>
      <Text style={type.h2}>{bought ? 'Bought' : 'Passed'}</Text>
      {bought ? (
        <>
          <Text style={type.body} testID="paid-line">
            Asked {formatInr(poll.priceInr)}. Paid <Text style={{ fontWeight: '800' }}>{formatInr(update.pricePaidInr ?? 0)}</Text>
            {diff > 0 ? ` (${formatInr(diff)} less)` : diff < 0 ? ` (${formatInr(-diff)} more)` : ''}.
          </Text>
          {update.review ? <Text style={type.body} testID="review-text">“{update.review}”</Text> : null}
          {update.storeUrl ? (
            <View style={{ gap: 6 }}>
              <Pressable testID="store-link" accessibilityRole="link" onPress={() => Linking.openURL(update.storeUrl!)}
                style={{ minHeight: 48, justifyContent: 'center' }}>
                <Text style={{ color: colors.wait, fontSize: 16, fontWeight: '800', textDecorationLine: 'underline' }}>Open store link</Text>
              </Pressable>
              <Text style={type.small} numberOfLines={1}>{update.storeUrl}</Text>
              {update.isAffiliate ? <Banner kind="warn" testID="affiliate-disclosure">{AFFILIATE_DISCLOSURE}</Banner> : null}
            </View>
          ) : null}
        </>
      ) : <Text style={type.body}>The author decided not to buy this one.</Text>}
      <Text style={type.small}>Updated {timeAgo(update.updatedAt)}</Text>
    </View>
  );
}

function UpdateForm({ poll, existing, onSaved, onCancel }: { poll: Poll; existing: PurchaseUpdate | null; onSaved: () => void; onCancel?: () => void }) {
  const [status, setStatus] = useState<'bought' | 'passed' | null>(existing?.status ?? null);
  const [paid, setPaid] = useState(existing?.pricePaidInr ? String(existing.pricePaidInr) : String(poll.priceInr));
  const [review, setReview] = useState(existing?.review ?? '');
  const [url, setUrl] = useState(existing?.storeUrl ?? '');
  const [affiliate, setAffiliate] = useState(existing?.isAffiliate ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!status) return setError('Choose Bought or Passed first.');
    const pricePaid = status === 'bought' ? parsePrice(paid) : null;
    if (status === 'bought' && pricePaid === null) return setError('Enter the price you actually paid, in rupees.');
    setBusy(true); setError(null);
    try { await repo.savePurchaseUpdate(poll.id, { status, pricePaidInr: pricePaid, review, storeUrl: url, isAffiliate: affiliate }); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save the update.'); }
    finally { setBusy(false); }
  }

  return (
    <View testID="update-form" style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 12, borderWidth: 1, borderColor: colors.border }}>
      <Text style={type.h2}>What did you decide?</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {(['bought', 'passed'] as const).map((st) => (
          <Button key={st} testID={`status-${st}`} style={{ flex: 1 }} variant={status === st ? 'primary' : 'secondary'} label={st === 'bought' ? 'Bought' : 'Passed'} onPress={() => { setStatus(st); setError(null); }} />
        ))}
      </View>
      {status === 'bought' ? (
        <>
          <Field testID="paid-input" label="Price you paid (₹)" value={paid} onChangeText={setPaid} keyboardType="number-pad" inputMode="numeric" />
          <Field testID="review-input" label="Short review (optional)" value={review} onChangeText={setReview} maxLength={LIMITS.review} multiline hint={`${review.length}/${LIMITS.review}`} />
          <Field testID="url-input" label="Store link (optional)" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" autoComplete="off" placeholder="https://example.com/product" />
          <Pressable testID="affiliate-toggle" accessibilityRole="checkbox" accessibilityState={{ checked: affiliate, disabled: !url.trim() }}
            onPress={() => url.trim() && setAffiliate(!affiliate)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, opacity: url.trim() ? 1 : 0.5 }}>
            <View style={{ width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: colors.ink, backgroundColor: affiliate && url.trim() ? colors.ink : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              {affiliate && url.trim() ? <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text> : null}
            </View>
            <Text style={[type.body, { flex: 1 }]}>This is an affiliate link (I may earn a commission)</Text>
          </Pressable>
          {affiliate && url.trim() ? <Banner kind="info">Visitors will see this next to your link: “{AFFILIATE_DISCLOSURE}”</Banner> : null}
        </>
      ) : null}
      {error ? <Banner kind="error" testID="update-error">{error}</Banner> : null}
      <Button testID="save-update" label={busy ? 'Saving…' : existing ? 'Save changes' : 'Post update'} loading={busy} onPress={save} />
      {onCancel ? <Button variant="quiet" label="Cancel" onPress={onCancel} /> : null}
    </View>
  );
}

export function UpdateSection({ poll, update, isAuthor, onChanged }: { poll: Poll; update: PurchaseUpdate | null; isAuthor: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  if (update && !editing) {
    return (
      <View style={{ gap: 10 }}>
        <Text style={type.h2}>Purchase update</Text>
        <UpdateCard poll={poll} update={update} />
        {isAuthor ? <Button testID="edit-update" variant="secondary" label="Edit update" onPress={() => setEditing(true)} /> : null}
      </View>
    );
  }
  if (isAuthor) {
    return (
      <View style={{ gap: 10 }}>
        <Text style={type.h2}>Purchase update</Text>
        <UpdateForm poll={poll} existing={update} onSaved={() => { setEditing(false); onChanged(); }} onCancel={update ? () => setEditing(false) : undefined} />
      </View>
    );
  }
  return null;
}
