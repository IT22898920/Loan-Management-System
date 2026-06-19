'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { toast } from 'sonner';
import { Loader2, Camera, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateProfilePhotoAction, removeProfilePhotoAction } from '@/app/actions/profile';

interface Props {
  initialPhotoUrl: string | null;
  fullName: string;
}

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '';
const CLOUDINARY_API = 'https://api.cloudinary.com/v1_1/' + CLOUD_NAME + '/image/upload';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

export default function ProfilePhotoUpload({ initialPhotoUrl, fullName }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(initialPhotoUrl);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const configured = CLOUD_NAME && UPLOAD_PRESET;

  function pickFile() {
    if (!configured) {
      toast.error('Cloudinary is not configured. Ask the administrator to set NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET.');
      return;
    }
    fileInputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Please choose a JPG, PNG, WEBP, or HEIC image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Image is too large (max 5 MB).');
      return;
    }

    setUploading(true);
    try {
      // 1) Upload directly to Cloudinary CDN (browser → Cloudinary)
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', UPLOAD_PRESET);
      fd.append('folder', 'diriyalanka/profile-photos');

      const res = await fetch(CLOUDINARY_API, { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok || !body.secure_url) {
        throw new Error(body?.error?.message || 'Upload failed.');
      }

      // 2) Persist the secure_url onto our profile row
      const result = await updateProfilePhotoAction(body.secure_url);
      if (result?.error) {
        toast.error(result.error);
        return;
      }

      setPhotoUrl(body.secure_url);
      toast.success('Profile photo updated.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (!photoUrl) return;
    if (!confirm('Remove profile photo?')) return;
    setRemoving(true);
    const result = await removeProfilePhotoAction();
    setRemoving(false);
    if (result?.error) {
      toast.error(result.error);
      return;
    }
    setPhotoUrl(null);
    toast.success('Profile photo removed.');
  }

  const initials = fullName.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-5">
      <div className="relative">
        {photoUrl ? (
          <Image
            src={photoUrl}
            alt={fullName + ' profile photo'}
            width={96}
            height={96}
            className="w-24 h-24 rounded-2xl object-cover border-4 border-white shadow-md"
            unoptimized
          />
        ) : (
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-3xl font-bold text-white border-4 border-white shadow-md">
            {initials || <User className="h-8 w-8" />}
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          onClick={pickFile}
          disabled={uploading || removing}
          className="rounded-xl"
        >
          <Camera className="h-4 w-4 mr-2" />
          {photoUrl ? 'Change Photo' : 'Upload Photo'}
        </Button>
        {photoUrl && (
          <Button
            type="button"
            variant="outline"
            onClick={handleRemove}
            disabled={uploading || removing}
            className="rounded-xl ml-2 text-red-600 border-red-200 hover:bg-red-50"
          >
            {removing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Remove
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          JPG, PNG, WEBP, or HEIC. Max 5 MB.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}
