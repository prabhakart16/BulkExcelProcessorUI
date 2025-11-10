import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Welcome } from "../welcome/welcome";
import { ExcelUploadComponent } from "./excel-upload-component/excel-upload-component";
import { Chunkuploader } from './chunkuploader/chunkuploader';

@Component({
  selector: 'app-root',
  imports: [Chunkuploader],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected title = 'AngularFirstApp';
}
