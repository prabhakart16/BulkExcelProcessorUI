import { Routes } from '@angular/router';
import { FileUploadComponent } from './chunkuploader/kafkaupload';

export const routes: Routes = [
    { path: 'kafka', component: FileUploadComponent },
];
