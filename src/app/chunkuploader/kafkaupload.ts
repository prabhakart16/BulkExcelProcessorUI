import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { catchError, finalize, from, mergeMap, of } from 'rxjs';
import * as XLSX from 'xlsx';

interface UploadProgress {
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  percentage: number;
  status: 'idle' | 'processing' | 'uploading' | 'completed' | 'error';
  message: string;
}

interface ExcelRecord {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  amount: number;
  date: string;
  // Add other fields as needed
}

interface ChunkPayload {
  batchId: string;
  chunkIndex: number;
  totalChunks: number;
  tenantId: string;
  records: ExcelRecord[];
}

interface ApiResponse {
  success: boolean;
  message: string;
  batchId: string;
  chunkIndex: number;
}

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="upload-container">
      <h2>Large File Upload</h2>

      <div class="upload-section">
        <input
          type="file"
          #fileInput
          accept=".xlsx,.xls"
          (change)="onFileSelected($event)"
          [disabled]="progress().status === 'processing' || progress().status === 'uploading'"
        />

        <button
          (click)="uploadFile()"
          [disabled]="!selectedFile() || progress().status === 'processing' || progress().status === 'uploading'"
          class="upload-btn"
        >
          {{ progress().status === 'uploading' ? 'Uploading...' : 'Upload File' }}
        </button>
      </div>

      @if (selectedFile()) {
        <div class="file-info">
          <p><strong>Selected File:</strong> {{ selectedFile()?.name }}</p>
          <p><strong>Size:</strong> {{ formatBytes(selectedFile()?.size || 0) }}</p>
        </div>
      }

      @if (progress().status !== 'idle') {
        <div class="progress-section">
          <div class="progress-bar-container">
            <div
              class="progress-bar"
              [style.width.%]="progress().percentage"
              [class.error]="progress().status === 'error'"
              [class.success]="progress().status === 'completed'"
            ></div>
          </div>

          <div class="progress-info">
            <p>
              <strong>Status:</strong> {{ progress().message }}
            </p>
            <p>
              <strong>Progress:</strong>
              {{ progress().completedChunks }} / {{ progress().totalChunks }} chunks
              ({{ progress().percentage.toFixed(1) }}%)
            </p>
            @if (progress().failedChunks > 0) {
              <p class="error-text">
                <strong>Failed Chunks:</strong> {{ progress().failedChunks }}
              </p>
            }
          </div>
        </div>
      }

      @if (errors().length > 0) {
        <div class="errors-section">
          <h3>Errors ({{ errors().length }})</h3>
          <ul>
            @for (error of errors(); track error.chunkIndex) {
              <li>Chunk {{ error.chunkIndex }}: {{ error.message }}</li>
            }
          </ul>
        </div>
      }
    </div>
  `,
  styles: [`
    .upload-container {
      max-width: 800px;
      margin: 2rem auto;
      padding: 2rem;
      font-family: system-ui, -apple-system, sans-serif;
    }

    h2 {
      margin-bottom: 1.5rem;
      color: #1a1a1a;
    }

    .upload-section {
      display: flex;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    input[type="file"] {
      flex: 1;
      padding: 0.5rem;
      border: 2px solid #e0e0e0;
      border-radius: 4px;
    }

    .upload-btn {
      padding: 0.75rem 1.5rem;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.2s;
    }

    .upload-btn:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .upload-btn:disabled {
      background: #9ca3af;
      cursor: not-allowed;
    }

    .file-info {
      padding: 1rem;
      background: #f3f4f6;
      border-radius: 4px;
      margin-bottom: 1.5rem;
    }

    .file-info p {
      margin: 0.5rem 0;
    }

    .progress-section {
      margin-top: 1.5rem;
    }

    .progress-bar-container {
      width: 100%;
      height: 24px;
      background: #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 1rem;
    }

    .progress-bar {
      height: 100%;
      background: #2563eb;
      transition: width 0.3s ease;
    }

    .progress-bar.success {
      background: #10b981;
    }

    .progress-bar.error {
      background: #ef4444;
    }

    .progress-info p {
      margin: 0.5rem 0;
    }

    .error-text {
      color: #dc2626;
    }

    .errors-section {
      margin-top: 1.5rem;
      padding: 1rem;
      background: #fee;
      border: 1px solid #fcc;
      border-radius: 4px;
    }

    .errors-section h3 {
      margin-top: 0;
      color: #dc2626;
    }

    .errors-section ul {
      margin: 0.5rem 0;
      padding-left: 1.5rem;
    }

    .errors-section li {
      margin: 0.25rem 0;
      color: #991b1b;
    }
  `]
})
export class FileUploadComponent {
  private readonly API_URL = 'https://localhost:7164/api/BulkUpload';
  private readonly CHUNK_SIZE = 200; // Records per chunk
  private readonly CONCURRENT_UPLOADS = 3; // Parallel upload limit

  selectedFile = signal<File | null>(null);
  progress = signal<UploadProgress>({
    totalChunks: 0,
    completedChunks: 0,
    failedChunks: 0,
    percentage: 0,
    status: 'idle',
    message: ''
  });
  errors = signal<Array<{ chunkIndex: number; message: string }>>([]);

  constructor(private http: HttpClient) {}

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile.set(input.files[0]);
      this.resetProgress();
    }
  }

  async uploadFile(): Promise<void> {
    const file = this.selectedFile();
    if (!file) return;

    this.resetProgress();
    this.updateProgress({ status: 'processing', message: 'Reading Excel file...' });

    try {
      // Read and parse Excel file
      const records = await this.parseExcelFile(file);

      if (records.length === 0) {
        throw new Error('No valid records found in the file');
      }

      // Generate unique batch ID
      const batchId = this.generateBatchId();

      // Split records into chunks
      const chunks = this.chunkArray(records, this.CHUNK_SIZE);
      const totalChunks = chunks.length;

      this.updateProgress({
        status: 'uploading',
        message: `Uploading ${records.length.toLocaleString()} records in ${totalChunks} chunks...`,
        totalChunks
      });

      // Upload chunks with concurrency control
      await this.uploadChunksWithConcurrency(batchId, chunks, totalChunks);

      // Final status
      const finalProgress = this.progress();
      if (finalProgress.failedChunks === 0) {
        this.updateProgress({
          status: 'completed',
          message: `Successfully uploaded all ${totalChunks} chunks!`,
          percentage: 100
        });
      } else {
        this.updateProgress({
          status: 'error',
          message: `Completed with ${finalProgress.failedChunks} failed chunks. Please retry.`
        });
      }
    } catch (error) {
      console.error('Upload error:', error);
      this.updateProgress({
        status: 'error',
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }

  private async parseExcelFile(file: File): Promise<ExcelRecord[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json<any>(firstSheet);

          // Transform and validate records
          const records: ExcelRecord[] = jsonData.map((row, index) => {
            // Parse date properly
            let dateValue: string;
            if (row.Date) {
              // Check if it's an Excel date number
              if (typeof row.Date === 'number') {
                // Convert Excel date to JS date
                const excelDate = new Date((row.Date - 25569) * 86400 * 1000);
                dateValue = excelDate.toISOString().split('T')[0]; // yyyy-MM-dd
              } else if (row.Date instanceof Date) {
                dateValue = row.Date.toISOString().split('T')[0];
              } else {
                // String date - try to parse
                const parsedDate = new Date(row.Date);
                dateValue = isNaN(parsedDate.getTime())
                  ? new Date().toISOString().split('T')[0]
                  : parsedDate.toISOString().split('T')[0];
              }
            } else {
              dateValue = new Date().toISOString().split('T')[0];
            }

            return {
              id: this.generateRecordId(index),
              tenantId: String(row.TenantId || row.tenantId || 'default-tenant'),
              name: String(row.Name || row.name || ''),
              email: String(row.Email || row.email || ''),
              amount: parseFloat(String(row.Amount || row.amount || 0)),
              date: dateValue
            };
          });

          // Validate we have records
          if (records.length === 0) {
            reject(new Error('No valid records found in Excel file'));
            return;
          }

          // Log first record for debugging
          console.log('Sample record:', records[0]);

          resolve(records);
        } catch (error) {
          reject(new Error(`Failed to parse Excel: ${error}`));
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsBinaryString(file);
    });
  }

  private async uploadChunksWithConcurrency(
    batchId: string,
    chunks: ExcelRecord[][],
    totalChunks: number
  ): Promise<void> {
    const chunkIndexes = Array.from({ length: chunks.length }, (_, i) => i);

    // Use RxJS for controlled concurrency
    await new Promise<void>((resolve, reject) => {
      from(chunkIndexes)
        .pipe(
          mergeMap(
            (chunkIndex) => this.uploadChunk(batchId, chunks[chunkIndex], chunkIndex, totalChunks),
            this.CONCURRENT_UPLOADS
          ),
          catchError((error) => {
            console.error('Chunk upload failed:', error);
            return of(null); // Continue processing other chunks
          }),
          finalize(() => resolve())
        )
        .subscribe();
    });
  }

  private uploadChunk(
    batchId: string,
    records: ExcelRecord[],
    chunkIndex: number,
    totalChunks: number
  ) {
    const payload: ChunkPayload = {
      batchId,
      chunkIndex,
      totalChunks,
      tenantId: records[0]?.tenantId || 'default-tenant', // Use first record's tenant
      records
    };

    console.log(`Uploading chunk ${chunkIndex}/${totalChunks} with ${records.length} records`);
    console.log('Payload sample:', {
      batchId: payload.batchId,
      chunkIndex: payload.chunkIndex,
      totalChunks: payload.totalChunks,
      tenantId: payload.tenantId,
      recordCount: payload.records.length,
      firstRecord: payload.records[0]
    });

    return this.http.post<ApiResponse>(this.API_URL, payload).pipe(
      catchError((error: HttpErrorResponse) => {
        const currentProgress = this.progress();
        this.updateProgress({
          failedChunks: currentProgress.failedChunks + 1
        });

        // Enhanced error logging
        console.error('Chunk upload failed:', {
          chunkIndex,
          status: error.status,
          statusText: error.statusText,
          error: error.error,
          message: error.message
        });

        this.errors.update(errors => [
          ...errors,
          {
            chunkIndex,
            message: error.error?.message || error.message || 'Upload failed'
          }
        ]);

        throw error;
      }),
      finalize(() => {
        const currentProgress = this.progress();
        const completedChunks = currentProgress.completedChunks + 1;
        const percentage = (completedChunks / totalChunks) * 100;

        this.updateProgress({
          completedChunks,
          percentage
        });
      })
    );
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private generateBatchId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `batch_${timestamp}_${random}`;
  }

  private generateRecordId(index: number): string {
    const timestamp = Date.now();
    return `rec_${timestamp}_${index}`;
  }

  private updateProgress(partial: Partial<UploadProgress>): void {
    this.progress.update(current => ({ ...current, ...partial }));
  }

  private resetProgress(): void {
    this.progress.set({
      totalChunks: 0,
      completedChunks: 0,
      failedChunks: 0,
      percentage: 0,
      status: 'idle',
      message: ''
    });
    this.errors.set([]);
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}
