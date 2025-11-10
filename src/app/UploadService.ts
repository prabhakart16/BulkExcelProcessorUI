import { HttpClient, HttpClientModule, HttpEventType } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({providedIn: 'root'})
export class UploadService {
  private apiUrl = 'https://localhost:5001/api/upload';

  constructor(private http: HttpClient) {}

  uploadChunk(blob: Blob, fileName: string, totalChunks: number, chunkNumber: number, batchId: string | null = null, readyForProcess: boolean = false): Promise<any> {
    const form = new FormData();
    form.append('chunkFile', blob, `chunk_${chunkNumber}`);
    form.append('fileName', fileName);
    form.append('totalChunks', totalChunks.toString());
    form.append('chunkNumber', chunkNumber.toString());
    if (batchId) form.append('batchId', batchId);
    form.append('readyForProcess', readyForProcess ? 'true' : 'false');

    return this.http.post(`${this.apiUrl}/upload`, form).toPromise();
  }
}
