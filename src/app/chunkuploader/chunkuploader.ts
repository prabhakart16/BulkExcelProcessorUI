import { Component } from '@angular/core';
import { UploadService } from '../UploadService';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule, HttpEventType } from '@angular/common/http';

@Component({
  selector: 'app-chunk-uploader',
  imports: [CommonModule,HttpClientModule],
  templateUrl: './chunkuploader.html',
})
export class Chunkuploader {
  file?: File;
  uploading = false;
  batchId: string | null = null;

  constructor(private uploadService: UploadService) {}

  onFileChange(event: any) {
    const f = event.target.files?.[0];
    if (f) this.file = f;
  }

  async startUpload() {
    if (!this.file) return;
    this.uploading = true;

    // For the purpose of demo, we'll split the file by *byte* slices rather than rows.
    // In production you'd parse Excel (e.g., with SheetJS) and split by 1000-row chunks.
    const chunkSizeBytes = 1024 * 100; // ~200KB per chunk as an example
    const totalChunks = Math.ceil(this.file.size / chunkSizeBytes);

    for (let chunkNumber = 0; chunkNumber < totalChunks; chunkNumber++) {
      const start = chunkNumber * chunkSizeBytes;
      const end = Math.min(this.file.size, start + chunkSizeBytes);
      const blob = this.file.slice(start, end);

      const isFirst = chunkNumber === 0;
      const readyForProcess = (chunkNumber === totalChunks - 1); // last chunk signals ready

      try {
        const result = await this.uploadService.uploadChunk(blob, this.file.name, totalChunks, chunkNumber, isFirst ? null : this.batchId, readyForProcess);
        if (isFirst && result.batchId) {
          this.batchId = result.batchId;
        }
        console.log('Uploaded chunk', chunkNumber);
      } catch (err) {
        console.error('Upload error', err);
        break;
      }
    }

    this.uploading = false;
    alert('Upload complete. BatchId: ' + this.batchId);
  }
}
