import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Smartphone, 
  Mail, 
  MessageSquare, 
  Key, 
  CheckCircle, 
  AlertTriangle, 
  Smartphone as DeviceIcon, 
  History, 
  Lock, 
  RefreshCcw,
  Copy,
  Download,
  ShieldCheck,
  ChevronRight,
  Monitor
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { authenticator } from 'otplib';

const MFASystem = ({ account, contract }) => {
  const [mfaStatus, setMfaStatus] = useState({
    enabled: false,
    method: null,
    backupCodes: [],
    trustedDevices: []
  });
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [selectedMethod, setSelectedMethod] = useState('totp');
  const [setupData, setSetupData] = useState({ secret: '', uri: '' });
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load MFA status from contract/storage
    const mockSecurity = {
        enabled: false,
        method: 'TOTP',
        backupCodes: ['ABCD-1234', 'EFGH-5678', 'IJKL-9012'],
        trustedDevices: [
            { id: 1, name: 'MacBook Pro - Chrome', lastActive: '2 mins ago', location: 'San Francisco, CA' },
            { id: 2, name: 'iPhone 15 - Safari', lastActive: '1 day ago', location: 'New York, NY' }
        ]
    };
    setMfaStatus(mockSecurity);
  }, [account]);

  const startSetup = () => {
    const secret = authenticator.generateSecret();
    const uri = authenticator.keyuri(account, 'HealthcareDrips', secret);
    setSetupData({ secret, uri });
    setShowWizard(true);
    setStep(1);
  };

  const handleVerify = () => {
    setLoading(true);
    setTimeout(() => {
      // Simulate verification
      setMfaStatus({
        ...mfaStatus,
        enabled: true,
        method: selectedMethod
      });
      setStep(4);
      setLoading(false);
    }, 1500);
  };

  const Wizard = () => (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-2xl shadow-2xl p-8 max-w-2xl w-full mx-auto mt-10"
    >
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-bold text-gray-900">Secure Your Account</h3>
          <span className="text-sm font-medium text-blue-600">Step {step} of 4</span>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s <= step ? 'bg-blue-600' : 'bg-gray-100'}`} />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div 
            key="step1"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -20, opacity: 0 }}
            className="space-y-6"
          >
            <p className="text-gray-600">Choose your preferred multi-factor authentication method:</p>
            <div className="grid gap-4">
              {[
                { id: 'totp', icon: Smartphone, title: 'Authenticator App', desc: 'Secure codes from Google Authenticator, Authy, etc.' },
                { id: 'sms', icon: MessageSquare, title: 'SMS Verification', desc: 'Receive a text message with a code.' },
                { id: 'email', icon: Mail, title: 'Email Verification', desc: 'Get a temporary code via email.' }
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMethod(m.id)}
                  className={`flex items-center p-4 border-2 rounded-xl transition-all ${selectedMethod === m.id ? 'border-blue-600 bg-blue-50' : 'border-gray-100 hover:border-blue-200'}`}
                >
                  <div className={`p-3 rounded-lg mr-4 ${selectedMethod === m.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                    <m.icon className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <h4 className="font-bold text-gray-900">{m.title}</h4>
                    <p className="text-sm text-gray-500">{m.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <button 
              onClick={() => setStep(2)}
              className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold flex items-center justify-center hover:bg-blue-700 transition-colors"
            >
              Continue <ChevronRight className="ml-2 w-5 h-5" />
            </button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div 
            key="step2"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -20, opacity: 0 }}
            className="text-center space-y-6"
          >
            {selectedMethod === 'totp' ? (
              <>
                <div className="bg-white p-6 inline-block rounded-2xl border-2 border-dashed border-gray-200">
                  <QRCodeSVG value={setupData.uri} size={200} />
                </div>
                <div className="space-y-2">
                  <h4 className="font-bold">Scan this QR Code</h4>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto">Use Google Authenticator or Microsoft Authenticator to scan this code.</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg flex items-center justify-between text-sm font-mono">
                  <span>{setupData.secret}</span>
                  <button className="text-blue-600 hover:text-blue-800"><Copy className="w-4 h-4" /></button>
                </div>
              </>
            ) : (
              <div className="py-10">
                <p className="text-gray-600">Enter your {selectedMethod === 'sms' ? 'phone number' : 'email address'} to continue.</p>
                <input 
                  type="text" 
                  placeholder={selectedMethod === 'sms' ? '+1 (555) 000-0000' : 'user@example.com'}
                  className="mt-4 w-full px-4 py-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            <div className="flex gap-4">
              <button 
                onClick={() => setStep(1)}
                className="flex-1 py-4 border rounded-xl font-bold hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button 
                onClick={() => setStep(3)}
                className="flex-1 bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition-colors"
              >
                Next
              </button>
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div 
            key="step3"
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -20, opacity: 0 }}
            className="text-center space-y-8"
          >
            <div className="p-4 bg-blue-50 text-blue-700 rounded-xl flex items-center text-sm">
              <ShieldCheck className="w-5 h-5 mr-3" />
              Confirmation required to finalize setup
            </div>
            <div className="space-y-4">
              <h4 className="font-bold">Enter Verification Code</h4>
              <p className="text-sm text-gray-500">Enter the 6-digit code from your device.</p>
              <div className="flex justify-center gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <input 
                    key={i}
                    type="text"
                    maxLength="1"
                    className="w-12 h-14 border-2 rounded-xl text-center text-2xl font-bold focus:border-blue-600 outline-none transition-all"
                    value={verificationCode[i-1] || ''}
                    onChange={(e) => {
                      const newCode = verificationCode.split('');
                      newCode[i-1] = e.target.value;
                      setVerificationCode(newCode.join(''));
                    }}
                  />
                ))}
              </div>
            </div>
            <button 
              onClick={handleVerify}
              disabled={loading}
              className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold disabled:opacity-50 flex items-center justify-center"
            >
              {loading ? <RefreshCcw className="w-5 h-5 animate-spin mr-2" /> : 'Complete Verification'}
            </button>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div 
            key="step4"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center space-y-8"
          >
            <div className="bg-green-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto text-green-500">
              <CheckCircle className="w-12 h-12" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold">MFA Enabled Successfully!</h3>
              <p className="text-gray-500">Your account is now protected with additional security.</p>
            </div>
            
            <div className="bg-orange-50 p-6 rounded-2xl text-left border-2 border-orange-100">
              <div className="flex items-center text-orange-700 font-bold mb-4">
                <AlertTriangle className="w-5 h-5 mr-2" /> Backup Codes
              </div>
              <p className="text-sm text-orange-600 mb-4">Save these codes. You'll need them if you lose access to your authenticator app.</p>
              <div className="grid grid-cols-2 gap-3 font-mono text-sm">
                {['ABCD-1234', 'EFGH-5678', 'IJKL-9012', 'MNOP-3456'].map(code => (
                  <div key={code} className="bg-white p-2 border rounded-lg text-center">{code}</div>
                ))}
              </div>
              <div className="flex gap-4 mt-6">
                <button className="flex-1 bg-white p-2 rounded-lg text-orange-700 text-sm font-bold border border-orange-200 flex items-center justify-center">
                  <Download className="w-4 h-4 mr-2" /> Download
                </button>
                <button className="flex-1 bg-white p-2 rounded-lg text-orange-700 text-sm font-bold border border-orange-200 flex items-center justify-center">
                  <Copy className="w-4 h-4 mr-2" /> Copy
                </button>
              </div>
            </div>

            <button 
              onClick={() => setShowWizard(false)}
              className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold hover:bg-black transition-colors"
            >
              Close and Finish
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  const SecurityDashboard = () => (
    <div className="space-y-8">
      {/* MFA Status Card */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden border">
        <div className="p-8 flex justify-between items-start">
          <div className="flex items-center space-x-6">
            <div className={`p-4 rounded-2xl ${mfaStatus.enabled ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
              <Shield className="w-10 h-10" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">MFA Status: {mfaStatus.enabled ? 'Active' : 'Not Configured'}</h3>
              <p className="text-gray-500">Multi-factor authentication adds an extra layer of security to your wallet.</p>
              {mfaStatus.enabled && (
                <div className="mt-3 flex items-center text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full inline-flex">
                  <CheckCircle className="w-4 h-4 mr-2" /> Primary Method: {mfaStatus.method}
                </div>
              )}
            </div>
          </div>
          {!mfaStatus.enabled && (
            <button 
              onClick={startSetup}
              className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200"
            >
              Setup MFA
            </button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Trusted Devices */}
        <div className="bg-white rounded-2xl shadow-lg border p-8">
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-xl font-bold flex items-center">
              <Monitor className="w-6 h-6 mr-3 text-blue-600" /> Trusted Devices
            </h4>
            <button className="text-sm text-blue-600 font-medium hover:underline">Manage All</button>
          </div>
          <div className="space-y-4">
            {mfaStatus.trustedDevices.map(device => (
              <div key={device.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition">
                <div className="flex items-center">
                  <DeviceIcon className="w-6 h-6 text-gray-400 mr-4" />
                  <div>
                    <h5 className="font-bold text-gray-900">{device.name}</h5>
                    <p className="text-xs text-gray-500">{device.location} • {device.lastActive}</p>
                  </div>
                </div>
                <div className="flex items-center">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                    <span className="text-xs font-bold text-green-600">Active</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Security Logs */}
        <div className="bg-white rounded-2xl shadow-lg border p-8">
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-xl font-bold flex items-center">
              <History className="w-6 h-6 mr-3 text-blue-600" /> Security Log
            </h4>
            <button className="text-sm text-blue-600 font-medium hover:underline">View All</button>
          </div>
          <div className="space-y-4">
            {[
              { icon: Lock, title: 'MFA setup initiated', time: '10 mins ago', type: 'info' },
              { icon: Key, title: 'New login from unknown IP', time: '2 hours ago', type: 'warning' },
              { icon: ShieldCheck, title: 'Password changed successfully', time: 'Yesterday', type: 'success' }
            ].map((log, i) => (
              <div key={i} className="flex items-start p-4 hover:bg-gray-50 rounded-xl transition">
                <div className={`p-2 rounded-lg mr-4 ${log.type === 'warning' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                  <log.icon className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="text-sm font-bold text-gray-900">{log.title}</h5>
                  <p className="text-xs text-gray-500">{log.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="mfa-system max-w-6xl mx-auto p-4">
      <header className="mb-10 text-center">
        <h2 className="text-4xl font-black text-gray-900 tracking-tight">Security & Protection</h2>
        <p className="text-gray-500 mt-2 text-lg">Manage your multi-factor authentication and trusted devices</p>
      </header>

      {showWizard ? (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <Wizard />
        </div>
      ) : (
        <SecurityDashboard />
      )}
    </div>
  );
};

export default MFASystem;
