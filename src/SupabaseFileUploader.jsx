// src/SupabaseFileUploader.js

import React, { useState, useCallback } from 'react';
import { supabase } from './supabaseClient';

// --- IMPORTANT: Change this to the name of the bucket you created ---
const BUCKET_NAME = 'media';

// A helper component to provide a "Copy to Clipboard" button
const CopyToClipboardButton = ({ textToCopy }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500); // Reset after 2.5 seconds
    });
  };

  return (
    <button 
      onClick={handleCopy} 
      className={`px-3 py-1 border rounded text-xs ${copied ? 'bg-green-100 text-green-700 border-green-200' : 'hover:bg-slate-100'}`}
    >
      {copied ? 'Copied!' : 'Copy URL to clipboard'}
    </button>
  );
};

// The main uploader component
const SupabaseFileUploader = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [error, setError] = useState(null);
  const fileInputRef = React.useRef(null);

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFiles(files);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      uploadFiles(files);
    }
  }, []);

  const uploadFiles = async (filesToUpload) => {
    setUploading(true);
    setError(null);
    try {
      const uploadPromises = Array.from(filesToUpload).map(async (file) => {
        const filePath = `public/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(filePath, file);

        if (uploadError) {
          throw uploadError;
        }

        const { data } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(filePath);

        return { name: file.name, url: data.publicUrl };
      });
      
      const newFiles = await Promise.all(uploadPromises);
      setUploadedFiles(prevFiles => [...prevFiles, ...newFiles]);

    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white border rounded-xl shadow-card p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Media Uploader</h2>
      
      {/* Uploader UI */}
      <div 
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-indigo-400 transition"
        onClick={() => fileInputRef.current?.click()}
      >
        <p className="text-slate-500">Drop files to upload</p>
        <p className="text-sm text-slate-400 my-2">or</p>
        <input 
          type="file" 
          multiple 
          onChange={handleFileSelect} 
          ref={fileInputRef}
          className="hidden"
        />
        <button 
          type="button" 
          className="px-4 py-1.5 border rounded-md text-sm font-medium hover:bg-slate-50"
        >
          Select Files
        </button>
      </div>

      {uploading && <p className="text-sm text-slate-500 mt-4">Uploading...</p>}
      {error && <p className="text-sm text-red-600 mt-4">Error: {error}</p>}

      {/* Uploaded Files List */}
      <div className="mt-6 space-y-4">
        {uploadedFiles.map((file, index) => (
          <div key={index} className="flex items-center gap-4 border rounded-lg p-3 bg-slate-50">
            <img src={file.url} alt={file.name} className="w-16 h-16 rounded-md object-cover bg-slate-200"/>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
              <div className="mt-1">
                <CopyToClipboardButton textToCopy={file.url} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SupabaseFileUploader;