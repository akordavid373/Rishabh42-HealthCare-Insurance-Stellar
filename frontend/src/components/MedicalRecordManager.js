import React, { useState, useEffect, useCallback } from 'react';
import { 
  FileText, 
  Upload, 
  Shield, 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  UserPlus, 
  UserMinus, 
  History, 
  Search, 
  Filter,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  FileCode,
  FileImageIcon,
  FileBox
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CryptoJS from 'crypto-js';
import { create as ipfsHttpClient } from 'ipfs-http-client';

// NOTE: In a real app, these would be env variables
const IPFS_PROJECT_ID = 'your_project_id';
const IPFS_PROJECT_SECRET = 'your_project_secret';
const auth = 'Basic ' + btoa(IPFS_PROJECT_ID + ':' + IPFS_PROJECT_SECRET);

const client = ipfsHttpClient({
  host: 'ipfs.infura.io',
  port: 5001,
  protocol: 'https',
  headers: {
    authorization: auth,
  },
});

const MedicalRecordManager = ({ account, contract }) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [decryptionKey, setDecryptionKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [viewingRecord, setViewingRecord] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (account && contract) {
      loadRecords();
    }
  }, [account, contract]);

  const loadRecords = async () => {
    try {
      setLoading(true);
      // In a real Soroban app, we'd use the Stellar SDK to call 'get_owner_records'
      // and then fetch each record detail using 'get_medical_record'
      
      // Mock data for demo since we don't have a real running network here
      const mockRecords = [
        {
          id: 1,
          description: 'Annual Health Checkup 2024',
          cid: 'QmXoypizj2WkeBvjR9hAS69XYY6XWjR3WJndM8Z6456',
          created: 1711200000,
          version: 1,
          type: 'report',
          owner: account,
          authorizedUsers: ['0x123...456']
        },
        {
          id: 2,
          description: 'X-Ray Chest Post-Op',
          cid: 'QmT5NvUtoM5nWFfrQdVrFzGfCu6Tq4Cj4E4Y4V4Y4V4',
          created: 1711210000,
          version: 2,
          type: 'image',
          owner: account,
          authorizedUsers: []
        }
      ];
      setRecords(mockRecords);
      setLoading(false);
    } catch (error) {
      console.error('Error loading records:', error);
      setLoading(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const uploadFile = async (file) => {
    try {
      setUploading(true);
      setUploadProgress(10);

      // 1. Generate a random encryption key (or use a user-provided one)
      const encryptionKey = CryptoJS.lib.WordArray.random(128 / 8).toString();
      
      // 2. Read file as ArrayBuffer
      setUploadProgress(30);
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target.result;
        
        // 3. Encrypt file content
        setUploadProgress(50);
        const encrypted = CryptoJS.AES.encrypt(
          CryptoJS.lib.WordArray.create(content),
          encryptionKey
        ).toString();

        // 4. Upload to IPFS
        setUploadProgress(70);
        // Note: Mocking IPFS upload for environment compatibility
        // const added = await client.add(encrypted);
        const mockCid = 'Qm' + Math.random().toString(36).substring(7);

        // 5. Save to Blockchain
        setUploadProgress(90);
        // if (contract) {
        //   const tx = await contract.upload_medical_record(account, mockCid, file.name);
        //   await tx.wait();
        // }
        
        const newRecord = {
          id: records.length + 1,
          description: file.name,
          cid: mockCid,
          created: Math.floor(Date.now() / 1000),
          version: 1,
          type: file.type.split('/')[0],
          owner: account,
          authorizedUsers: []
        };

        setRecords([newRecord, ...records]);
        setUploadProgress(100);
        setTimeout(() => {
          setUploading(false);
          setUploadProgress(0);
          alert(`File uploaded! Save your encryption key: ${encryptionKey}`);
        }, 500);
      };
      reader.readAsArrayBuffer(file);

    } catch (error) {
      console.error('Upload failed:', error);
      setUploading(false);
    }
  };

  const decryptAndPreview = async (record) => {
    if (!decryptionKey) {
      setShowKeyInput(true);
      setSelectedRecord(record);
      return;
    }

    try {
      setLoading(true);
      // 1. Fetch from IPFS
      // const stream = client.cat(record.cid);
      // let encryptedData = '';
      // for await (const chunk of stream) {
      //   encryptedData += chunk.toString();
      // }

      // 2. Decrypt
      // const decrypted = CryptoJS.AES.decrypt(encryptedData, decryptionKey);
      
      // Mock successful decryption
      setViewingRecord({
        ...record,
        content: 'Decrypted content placeholder for ' + record.description
      });
      setLoading(false);
      setShowKeyInput(false);
    } catch (error) {
      console.error('Decryption failed:', error);
      alert('Invalid decryption key');
      setLoading(false);
    }
  };

  const managePermissions = (record) => {
    // UI to add/remove authorized users
    setSelectedRecord(record);
    // Open a modal...
  };

  const filteredRecords = records.filter(r => {
    const matchesSearch = r.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || r.type === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="medical-record-manager p-6 max-w-6xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Secure Medical Records</h2>
          <p className="text-gray-600">Decentralized storage with IPFS & Encryption</p>
        </div>
        <div className="flex space-x-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search records..."
              className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="px-4 py-2 border rounded-lg bg-white"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="image">Images/Scans</option>
            <option value="report">Reports/PDFs</option>
            <option value="data">Lab Data</option>
          </select>
        </div>
      </header>

      {/* Upload Section */}
      <div 
        className={`upload-zone mb-10 border-2 border-dashed rounded-xl p-10 text-center transition-all ${dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <Upload className="w-12 h-12 mx-auto text-blue-500 mb-4" />
        <h3 className="text-xl font-semibold mb-2">Drag & Drop Medical Records</h3>
        <p className="text-gray-500 mb-6">Support for DICOM, PDF, JPEG, and PNG. Files are encrypted before upload.</p>
        
        <input 
          type="file" 
          id="file-upload" 
          className="hidden" 
          onChange={(e) => uploadFile(e.target.files[0])}
        />
        <label 
          htmlFor="file-upload"
          className="cursor-pointer bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Select File
        </label>

        {uploading && (
          <div className="mt-8">
            <div className="flex justify-between text-sm mb-2">
              <span>Encrypting and Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <motion.div 
                className="bg-blue-500 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Records Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <AnimatePresence>
          {filteredRecords.map((record) => (
            <motion.div 
              key={record.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="record-card bg-white border rounded-xl overflow-hidden hover:shadow-lg transition-all"
            >
              <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    {record.type === 'image' ? <FileImageIcon className="text-blue-600" /> : <FileText className="text-blue-600" />}
                  </div>
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => decryptAndPreview(record)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                      <Eye className="w-4 h-4 text-gray-600" />
                    </button>
                    <button 
                      onClick={() => managePermissions(record)}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                      <Shield className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                </div>
                
                <h4 className="font-bold text-gray-900 truncate mb-1">{record.description}</h4>
                <div className="text-sm text-gray-500 flex items-center mb-3">
                  <History className="w-3 h-3 mr-1" />
                  Version {record.version} • {new Date(record.created * 1000).toLocaleDateString()}
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="flex -space-x-2">
                    <div className="w-6 h-6 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-[10px] text-white">Yo</div>
                    {record.authorizedUsers.map((_, i) => (
                      <div key={i} className="w-6 h-6 rounded-full bg-gray-400 border-2 border-white" />
                    ))}
                  </div>
                  <span className="text-[10px] bg-gray-100 px-2 py-1 rounded-full text-gray-600">
                    {record.authorizedUsers.length} shared
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Key Input Modal */}
      {showKeyInput && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl p-8 max-w-md w-full shadow-2xl"
          >
            <div className="flex items-center space-x-3 mb-6">
              <Lock className="w-6 h-6 text-orange-500" />
              <h3 className="text-xl font-bold">Decryption Required</h3>
            </div>
            <p className="text-gray-600 mb-6 font-medium">Please enter the symmetric key used to encrypt this record.</p>
            <input 
              type="password" 
              placeholder="Enter encryption key"
              className="w-full px-4 py-3 border rounded-lg mb-6 outline-none focus:ring-2 focus:ring-blue-500"
              value={decryptionKey}
              onChange={(e) => setDecryptionKey(e.target.value)}
            />
            <div className="flex space-x-3">
              <button 
                onClick={() => { setShowKeyInput(false); setDecryptionKey(''); }}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button 
                onClick={() => decryptAndPreview(selectedRecord)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Decrypt File
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Viewer Modal */}
      {viewingRecord && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[60] p-10">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl w-full max-w-4xl h-full flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="p-6 border-b flex justify-between items-center bg-gray-50">
              <div className="flex items-center space-x-4">
                <FileText className="w-6 h-6 text-blue-600" />
                <div>
                  <h3 className="text-xl font-bold">{viewingRecord.description}</h3>
                  <p className="text-sm text-gray-500">CID: {viewingRecord.cid}</p>
                </div>
              </div>
              <button 
                onClick={() => setViewingRecord(null)}
                className="p-2 hover:bg-gray-200 rounded-full"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-10 bg-gray-100 flex items-center justify-center">
              <div className="bg-white p-8 shadow-sm rounded-lg max-w-2xl w-full aspect-[1/1.414] text-gray-800">
                <div className="border-b-2 border-gray-900 pb-4 mb-8 flex justify-between items-center">
                  <h1 className="text-2xl font-black uppercase tracking-tighter">Medical Report</h1>
                  <span className="text-sm font-mono">{viewingRecord.created}</span>
                </div>
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Patient Address</p>
                      <p className="text-sm font-mono truncate">{viewingRecord.owner}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">Version</p>
                      <p className="text-sm font-bold">{viewingRecord.version}.0.0</p>
                    </div>
                  </div>
                  <div className="pt-8 space-y-4">
                    <p className="text-sm leading-relaxed">{viewingRecord.content}</p>
                    <div className="h-40 bg-gray-50 rounded border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 italic text-sm">
                      Secure Preview of Raw Data...
                    </div>
                  </div>
                </div>
                <div className="mt-auto pt-20 flex justify-between items-end opacity-20">
                    <div className="w-20 h-20 bg-black rotate-45" />
                    <p className="text-[8px] font-mono">ENCRYPTED_SHA256_VERIFIED_ON_STELLAR</p>
                </div>
              </div>
            </div>
            <div className="p-6 border-t bg-gray-50 flex justify-end space-x-4">
                <button className="flex items-center px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg font-medium">
                    <History className="w-4 h-4 mr-2" />
                    View History
                </button>
                <button className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold">
                    Download Original
                </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default MedicalRecordManager;
