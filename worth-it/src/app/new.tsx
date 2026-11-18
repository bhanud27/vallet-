import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { repo } from '../lib/repo';
import { PickedPhoto } from '../lib/types';
import { LIMITS, parsePrice } from '../lib/validation';
import { Banner, Button, Field, Screen } from '../ui/kit';
import { SocialIcon } from '../ui/SocialIcon';
import { colors, type } from '../ui/theme';

export default function NewPoll() {
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [itemName, setItemName] = useState('Sneakers');
  const [price, setPrice] = useState('2499');
  const [question, setQuestion] = useState('Worth it for daily walking?');
  const [errors, setErrors] = useState<{ photo?: string; itemName?: string; price?: string; question?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(source: 'library' | 'camera') {
    setFormError(null);
    try {
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false, exif: false };
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return setErrors((e) => ({ ...e, photo: 'Camera access is off. Allow it in Settings or choose a photo instead.' }));
      }
      const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync({ ...opts, allowsMultipleSelection: false });
      if (res.canceled || !res.assets?.[0]) return;
      setPhoto({ uri: res.assets[0].uri, mimeType: res.assets[0].mimeType });
      setErrors((e) => ({ ...e, photo: undefined }));
    } catch {
      setErrors((e) => ({ ...e, photo: 'Could not open your photos. Try again.' }));
    }
  }

  async function submit() {
    const next: typeof errors = {};
    const priceInr = parsePrice(price);
    if (!photo) next.photo = 'Add one product photo.';
    if (!itemName.trim()) next.itemName = 'Enter the item name.';
    if (priceInr === null) next.price = 'Enter the asking price in rupees, for example 2499.';
    if (!question.trim()) next.question = 'Write the question you want answered.';
    setErrors(next);
    if (Object.keys(next).length || !photo || priceInr === null) return;
    setBusy(true); setFormError(null);
    try {
      const poll = await repo.createPoll({ itemName, priceInr, question, photo });
      router.replace(`/p/${poll.id}`);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not publish the poll.');
    } finally { setBusy(false); }
  }

  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={type.title}>What are you thinking of buying?</Text>
        <Text style={type.small}>Add a photo and asking price to get feedback from friends.</Text>
      </View>

      <View style={styles.section}>
        <Text style={type.h2}>Product photo</Text>
        {photo ? (
          <View style={styles.previewFrame}>
            <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" accessibilityLabel="Selected product photo" />
          </View>
        ) : (
          <View style={styles.placeholder}>
            <SocialIcon name="photo" color={colors.accent} />
            <Text style={type.small}>One photo of the item</Text>
          </View>
        )}
        <View style={styles.photoActions}>
          <Button testID="pick-photo" style={styles.action} variant="secondary" label={photo ? 'Replace photo' : 'Choose a photo'} onPress={() => pick('library')} />
          {Platform.OS !== 'web' ? <Button style={styles.action} variant="secondary" label="Take photo" onPress={() => pick('camera')} /> : null}
        </View>
        {errors.photo ? <Text style={{ color: colors.danger, fontSize: 13 }}>{errors.photo}</Text> : null}
        <Text style={type.small}>Anyone with the poll link can view this photo. Keep faces, addresses, and receipts out of the frame.</Text>
      </View>

      <View style={styles.section}>
        <Field testID="item-name" label="Item name" value={itemName} onChangeText={setItemName} maxLength={LIMITS.itemName} error={errors.itemName} />
        <Field testID="price" label="Asking price (₹)" value={price} onChangeText={setPrice} keyboardType="number-pad" inputMode="numeric" error={errors.price} hint="Whole rupees, for example 2499" />
        <Field testID="question" label="Your question" value={question} onChangeText={setQuestion} maxLength={LIMITS.question} multiline error={errors.question} />
      </View>

      {formError ? <Banner kind="error" testID="form-error">{formError}</Banner> : null}
      <Button testID="publish" label={busy ? 'Publishing…' : 'Publish poll'} loading={busy} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 4 },
  section: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 17, padding: 15, gap: 12 },
  placeholder: { minHeight: 90, borderRadius: 11, backgroundColor: colors.accentSoft, justifyContent: 'center', alignItems: 'center', gap: 6 },
  previewFrame: { width: '100%', aspectRatio: 4 / 3, borderRadius: 11, backgroundColor: colors.accentSoft, overflow: 'hidden' },
  preview: { position: 'absolute', width: '100%', height: '100%' },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { flexGrow: 1 },
});
