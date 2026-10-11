import type { Metadata } from 'next';
import { UploadFlow } from '@/components/studio/upload-flow';

export const metadata: Metadata = { title: 'Upload' };

export default function UploadPage() {
  return <UploadFlow />;
}
