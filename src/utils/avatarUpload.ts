import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';

interface UploadAvatarResult {
  url: string | null;
  error: string | null;
}

/**
 * Uploads an avatar image to Supabase storage
 * Uses expo-file-system for reliable base64 reading in React Native
 *
 * @param uri - Local file URI of the image to upload
 * @param userId - User ID to use in the filename path
 * @returns Object with url (public URL) or error message
 */
export async function uploadAvatar(uri: string, userId: string): Promise<UploadAvatarResult> {
  try {
    // Resize and compress the image
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 400, height: 400 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );

    const filename = `${userId}/avatar-${Date.now()}.jpg`;

    // Read file as base64 using expo-file-system new File API
    const file = new File(manipulated.uri);
    const base64Data = await file.base64();

    // Upload to Supabase storage using decoded base64
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filename, decode(base64Data), {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('Avatar upload error:', uploadError);
      return { url: null, error: uploadError.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filename);

    return { url: urlData.publicUrl, error: null };
  } catch (error) {
    console.error('Error uploading avatar:', error);
    return {
      url: null,
      error: error instanceof Error ? error.message : 'Failed to upload avatar'
    };
  }
}
