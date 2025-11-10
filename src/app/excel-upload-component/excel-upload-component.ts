import { Component } from '@angular/core';
import * as XLSX from 'xlsx';
import { HttpClient, HttpClientModule, HttpEventType } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-excel-upload',
  templateUrl: './excel-upload-component.html',
  imports: [CommonModule,HttpClientModule],
  styleUrls: ['./excel-upload-component.css']
})
export class ExcelUploadComponent {
  file: File | null = null;
  data: any[] = [];
  chunkSize = 500; // 50k rows per chunk (adjust as needed)
  uploadProgress = 0;
  totalChunks = 0;
  uploadedChunks = 0;
  batchId = '';
  isUploading = false;

  constructor(private http: HttpClient) { }

  onFileChange(event: any): void {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    this.file = selectedFile;
    this.batchId = this.generateBatchId();
    this.uploadProgress = 0;
    this.uploadedChunks = 0;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const binaryStr = e.target.result;
      const workbook = XLSX.read(binaryStr, { type: 'binary' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      this.data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // raw 2D array
      this.totalChunks = Math.ceil((this.data.length - 1) / this.chunkSize);
    };
    reader.readAsBinaryString(selectedFile);
  }

  async uploadInChunks(): Promise<void> {
    if (!this.data.length || !this.file) return;

    this.isUploading = true;
    this.uploadedChunks = 0;

    // Skip header row
    const headers = this.data[0];
    const rows = this.data.slice(1);

    for (let i = 0; i < rows.length; i += this.chunkSize) {
      const chunkRows = [headers, ...rows.slice(i, i + this.chunkSize)];
      const chunkFile = this.convertToExcelBlob(chunkRows);
      const chunkNumber = Math.floor(i / this.chunkSize) + 1;

      await this.uploadChunk(chunkFile, chunkNumber);
      this.uploadedChunks++;
      this.uploadProgress = Math.round((this.uploadedChunks / this.totalChunks) * 100);
    }

    this.isUploading = false;
    alert('✅ Upload complete! The system will process and generate the final report.');
  }

 private async uploadChunk(file: Blob, chunkNumber: number): Promise<void> {
  const formData = new FormData();

  // These keys must match the property names in UploadChunkRequest
  formData.append('file', file, `chunk_${chunkNumber}.xlsx`);
  formData.append('batchId', this.batchId);
  formData.append('chunkNumber', chunkNumber.toString());

  // ✅ The API now reads everything from [FromForm], so remove query parameters
  const apiUrl = `${environment.apiBaseUrl}/api/Upload/upload-excel`;

  return new Promise((resolve, reject) => {
    this.http.post(apiUrl, formData, {
      reportProgress: true,
      observe: 'events'
    }).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          const percent = Math.round((100 * event.loaded) / event.total);
          console.log(`Chunk ${chunkNumber}: ${percent}%`);
        } else if (event.type === HttpEventType.Response) {
          console.log(`✅ Chunk ${chunkNumber} uploaded successfully`);
          resolve();
        }
      },
      error: (err) => {
        console.error(`❌ Error uploading chunk ${chunkNumber}`, err);
        reject(err);
      }
    });
  });
}

  private convertToExcelBlob(data: any[][]): Blob {
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Chunk');
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  private generateBatchId(): string {
    return 'BATCH_' + Date.now();
  }
}
