import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { getProductPreview, productPhoto } from '../lib/productPreview';
import type { ProductPreview } from '../lib/productPreview';
import { repo } from '../lib/repo';
import { validateSelectedVideo } from '../lib/socialVideo';
import { MAX_POLL_MEDIA } from '../lib/types';
import type { NewPollMedia } from '../lib/types';
import { LIMITS, parsePrice, parseProductUrl } from '../lib/validation';
import { GalleryMedia, ProductImageLink } from '../ui/GalleryMedia';
import { Banner, Button, Field, Screen } from '../ui/kit';
import { SocialIcon } from '../ui/SocialIcon';
import { colors, type } from '../ui/theme';

type DraftItem = NewPollMedia & { id: string };
type ImportResult = { url: string; preview?: Omit<ProductPreview, 'images'> & { imageCount: number }; error?: string };
type Errors = { media?: string; itemName?: string; price?: string; question?: string; link?: string };

export default function NewPoll() {
  const [media, setMedia] = useState<DraftItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [storeLink, setStoreLink] = useState('');
  const [importResult, setImportResult] = useState<ImportResult>();
  const [nameInput, setItemName] = useState<string>();
  const [priceInput, setPrice] = useState<string>();
  const [questionInput, setQuestion] = useState<string>();
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const productUrl = parseProductUrl(storeLink);
  const activeImport = importResult?.url === productUrl ? importResult : undefined;
  const preview = activeImport?.preview;
  const importing = !!productUrl && !activeImport;
  const itemName = nameInput ?? (productUrl ? preview?.name ?? '' : 'Sneakers');
  const price = priceInput ?? (productUrl ? preview?.price?.toString() ?? '' : '2499');
  const question = questionInput ?? (productUrl ? 'Is this worth the asking price?' : 'Worth it for daily walking?');
  const selected = media.find((item) => item.id === selectedId) ?? media[0];
  const position = selected ? media.indexOf(selected) : -1;

  useEffect(() => {
    if (!productUrl) return;
    const request = new AbortController();
    const timer = setTimeout(() => {
      const deadline = setTimeout(() => {
        setImportResult({ url: productUrl, error: 'The store preview took too long.' });
        request.abort();
      }, 28_000);
      getProductPreview(productUrl, request.signal).then((result) => {
        if (request.signal.aborted) return;
        const imported = result.images.map((image): DraftItem => ({
          id: randomUUID(), kind: 'image', file: productPhoto(image), sourceUrl: productUrl,
        }));
        setMedia((current) => current.some((item) => item.sourceUrl === productUrl)
          ? current : [...current, ...imported].slice(0, MAX_POLL_MEDIA));
        setImportResult({ url: productUrl, preview: { name: result.name, price: result.price, limited: result.limited, imageCount: imported.length } });
      }).catch((error) => {
        if (!request.signal.aborted) {
          setImportResult({ url: productUrl, error: error instanceof Error ? error.message : 'Could not fetch store images.' });
        }
      }).finally(() => clearTimeout(deadline));
      request.signal.addEventListener('abort', () => clearTimeout(deadline), { once: true });
    }, 650);
    return () => { clearTimeout(timer); request.abort(); };
  }, [productUrl]);

  async function pick(source: 'library' | 'camera') {
    setFormError(null);
    if (media.length >= MAX_POLL_MEDIA) return;
    try {
      const photoOptions: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setErrors((current) => ({ ...current, media: 'Camera access is off. Allow it in Settings or choose a photo instead.' }));
          return;
        }
      }
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(photoOptions)
        : await ImagePicker.launchImageLibraryAsync({
          ...photoOptions, mediaTypes: ['images', 'videos'], allowsMultipleSelection: true,
          orderedSelection: true, selectionLimit: MAX_POLL_MEDIA - media.length,
        });
      if (result.canceled) return;
      const incoming: DraftItem[] = [];
      let validationError: string | undefined;
      for (const asset of result.assets) {
        const video = asset.type === 'video' || asset.mimeType?.startsWith('video/') || /\.mp4$/i.test(asset.fileName ?? asset.uri);
        if (video) {
          try {
            validateSelectedVideo(asset);
            incoming.push({ id: randomUUID(), kind: 'video', file: asset });
          } catch (error) {
            validationError = error instanceof Error ? error.message : 'Could not add the video.';
          }
        } else {
          incoming.push({ id: randomUUID(), kind: 'image', file: { uri: asset.uri, mimeType: asset.mimeType } });
        }
      }
      if (incoming.length) {
        setMedia((current) => [...current, ...incoming].slice(0, MAX_POLL_MEDIA));
        setSelectedId(incoming[0].id);
      }
      setErrors((current) => ({ ...current, media: validationError }));
    } catch {
      setErrors((current) => ({ ...current, media: 'Could not open your media library. Try again.' }));
    }
  }

  function move(offset: number) {
    if (!selected) return;
    setMedia((current) => {
      const index = current.findIndex((item) => item.id === selected.id);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const reordered = [...current];
      reordered.splice(index, 1);
      reordered.splice(target, 0, selected);
      return reordered;
    });
  }

  async function submit() {
    const next: Errors = {};
    const priceInr = parsePrice(price);
    if (storeLink.trim() && !productUrl) next.link = 'Enter a public HTTPS product link.';
    if (!media.length && !productUrl && !next.link) next.media = 'Add a photo, video, or product link.';
    if (!itemName.trim()) next.itemName = 'Enter the item name.';
    if (priceInr === null) next.price = 'Enter the asking price in rupees, for example 2499.';
    if (!question.trim()) next.question = 'Write the question you want answered.';
    setErrors(next);
    if (Object.keys(next).length || priceInr === null) return;
    setBusy(true);
    setFormError(null);
    try {
      const poll = await repo.createPoll({ itemName, priceInr, question, media, productUrl: productUrl ?? undefined });
      router.replace('/p/' + poll.id);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not publish the poll.');
    } finally {
      setBusy(false);
    }
  }

  const limitReached = media.length >= MAX_POLL_MEDIA;
  const importedCount = media.filter((item) => item.sourceUrl === productUrl).length;
  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={type.title}>What are you thinking of buying?</Text>
        <Text style={type.small}>Add photos, videos, or a product link and an asking price.</Text>
      </View>
      <View style={styles.section}>
        <Field label="Product link (optional)" value={storeLink} onChangeText={(next) => {
          if (parseProductUrl(next) !== productUrl) setImportResult(undefined);
          setStoreLink(next);
          setErrors((current) => ({ ...current, link: undefined, media: undefined }));
        }} placeholder="https://www.amazon.in/…" autoCapitalize="none" autoCorrect={false} maxLength={LIMITS.productUrl}
          keyboardType="url" editable={!busy} error={errors.link} />
        {importing ? <Banner kind="info">Finding product images…</Banner> : null}
        {activeImport?.error ? <Banner kind="info">{activeImport.error} You can publish with the link or add your own media.</Banner> : null}
        {preview && importedCount > 0 ? <Text style={type.small}>{importedCount} {importedCount === 1 ? 'store image' : 'store images'} in this gallery.</Text> : null}
        {preview?.limited || (preview && limitReached && importedCount < preview.imageCount)
          ? <Text style={type.small}>The importer reached its size or item limit.</Text> : null}
      </View>

      <View style={styles.section}>
        <View style={styles.mediaTitle}>
          <Text style={type.h2}>Product gallery</Text>
          <Text style={type.small}>{media.length} / {MAX_POLL_MEDIA}</Text>
        </View>
        {selected ? (
          <>
            <View style={styles.previewFrame}>
              <GalleryMedia key={selected.id} item={{ kind: selected.kind, value: selected.file.uri }} label="Selected product photo" />
              <ProductImageLink url={selected.sourceUrl} />
            </View>
            <View style={styles.thumbnails}>
              {media.map((item, index) => (
                <Pressable key={item.id} accessibilityRole="button"
                  accessibilityLabel={(item.kind === 'video' ? 'Video ' : 'Photo ') + (index + 1)}
                  aria-pressed={selected.id === item.id} onPress={() => setSelectedId(item.id)}
                  style={[styles.thumbnail, selected.id === item.id && styles.selected]}>
                  {item.kind === 'image' ? <Image source={item.file} style={styles.thumbImage} /> : <SocialIcon name="reels" color={colors.accent} />}
                </Pressable>
              ))}
            </View>
            <View style={styles.row}>
              <Button label="Move earlier" variant="secondary" disabled={busy || position <= 0} onPress={() => move(-1)} />
              <Button label="Move later" variant="secondary" disabled={busy || position >= media.length - 1} onPress={() => move(1)} />
              <Button label="Remove" variant="quiet" disabled={busy} onPress={() => setMedia((current) => current.filter((item) => item.id !== selected.id))} />
            </View>
          </>
        ) : (
          <View style={styles.placeholder}><SocialIcon name="photo" color={colors.accent} /><Text style={type.small}>Photos and MP4 videos up to 20 MB each</Text></View>
        )}
        <View style={styles.row}>
          <Button testID="pick-photo" style={styles.action} variant="secondary" disabled={busy || limitReached} label="Add photos or videos" onPress={() => pick('library')} />
          {Platform.OS !== 'web' ? <Button style={styles.action} variant="secondary" disabled={busy || limitReached} label="Take photo" onPress={() => pick('camera')} /> : null}
        </View>
        {errors.media ? <Text style={{ color: colors.danger, fontSize: 13 }}>{errors.media}</Text> : null}
        <Text style={type.small}>Anyone with the poll link can view this gallery.</Text>
      </View>

      <View style={styles.section}>
        <Field testID="item-name" label="Item name" value={itemName} onChangeText={setItemName} maxLength={LIMITS.itemName} error={errors.itemName} editable={!busy} />
        <Field testID="price" label="Asking price (₹)" value={price} onChangeText={setPrice} keyboardType="number-pad" inputMode="numeric" error={errors.price} hint="Whole rupees, for example 2499" editable={!busy} />
        <Field testID="question" label="Your question" value={question} onChangeText={setQuestion} maxLength={LIMITS.question} multiline error={errors.question} editable={!busy} />
      </View>

      {formError ? <Banner kind="error" testID="form-error">{formError}</Banner> : null}
      <Button testID="publish" label={busy ? 'Publishing…' : 'Publish poll'} loading={busy} disabled={importing} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 4 },
  section: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 17, padding: 15, gap: 12 },
  mediaTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  placeholder: { minHeight: 90, borderRadius: 11, backgroundColor: colors.accentSoft, justifyContent: 'center', alignItems: 'center', padding: 10, gap: 6 },
  previewFrame: { width: '100%', aspectRatio: 4 / 3, borderRadius: 11, backgroundColor: colors.accentSoft, overflow: 'hidden' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { flexGrow: 1 },
  thumbnails: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbnail: { padding: 2, width: 54, height: 54, borderRadius: 9, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  selected: { borderColor: colors.accent },
  thumbImage: { width: '100%', height: '100%', borderRadius: 5 },
});
