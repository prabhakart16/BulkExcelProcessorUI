import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Chunkuploader } from './chunkuploader';

describe('Chunkuploader', () => {
  let component: Chunkuploader;
  let fixture: ComponentFixture<Chunkuploader>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Chunkuploader]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Chunkuploader);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
