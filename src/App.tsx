import React, { useState, useEffect, Component } from 'react';
import { 
  auth, db, signOut, storage,
  collection, doc, setDoc, getDoc, getDocs, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, Timestamp,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, firebaseConfig,
  ref, uploadBytes, getDownloadURL, deleteObject, uploadBytesResumable,
  handleFirestoreError, OperationType
} from './firebase';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { ITRAK_MODULES, ITRAKModule } from './constants';
import { cn } from './lib/utils';
import { 
  LayoutDashboard, Users, FileText, Plus, LogOut, 
  ShieldCheck, MapPin, User, Mail, Lock, CheckCircle2, 
  ArrowRight, BarChart3, Info, Calendar, Send, Trash2,
  ChevronRight, Download, ExternalLink, Menu, X, FileUp, FileDown, Eye,
  MessageSquare, Star
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, Legend
} from 'recharts';

// --- Types ---
interface ClientProfile {
  id: string;
  hospitalName: string;
  location: string;
  directorName: string;
  email: string;
  pinCode: string;
  createdBy: string;
  createdAt: any;
}

interface Quote {
  id: string;
  clientId: string;
  selectedModuleIds: string[];
  totalMonthlyCost: number;
  oneTimeFee: number;
  status: 'draft' | 'sent';
  viewCount: number;
  lastViewed: any;
  createdBy: string;
  createdAt: any;
}

interface SystemUser {
  id: string;
  email: string;
  role: 'admin' | 'sales_rep';
  name: string;
  pinCode?: string;
}

interface Feedback {
  id: string;
  quoteId: string;
  clientId: string;
  clientName: string;
  message: string;
  rating?: number;
  createdAt: any;
}

// --- Components ---

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

const ErrorBoundary: any = class extends Component<any, any> {
  constructor(props: any) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if ((this as any).state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse((this as any).state.error?.message || '{}');
        if (parsed.error && parsed.error.includes("insufficient permissions")) {
          errorMessage = "You don't have permission to perform this action. Please check your role or contact the administrator.";
        }
      } catch (e) {
        errorMessage = (this as any).state.error?.message || errorMessage;
      }

      return (
        <div className="h-screen flex flex-col items-center justify-center bg-slate-900 p-6 text-center">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center text-red-500 mb-6">
            <ShieldCheck size={40} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">Access Denied or Error</h2>
          <p className="text-slate-400 max-w-md mb-8">{errorMessage}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-8 py-3 bg-teal-500 text-slate-900 rounded-xl font-bold hover:bg-teal-400 transition-all"
          >
            Refresh Application
          </button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

const AdminDashboard = ({ user, userRole, onLogout }: { user: any, userRole: 'admin' | 'sales_rep', onLogout: () => void }) => {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [modules, setModules] = useState<ITRAKModule[]>([]);
  const [team, setTeam] = useState<SystemUser[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [activeTab, setActiveTab] = useState<'clients' | 'quotes' | 'modules' | 'team' | 'feedback'>('clients');
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newClient, setNewClient] = useState({
    hospitalName: '',
    location: '',
    directorName: '',
    email: '',
    pinCode: Math.floor(1000 + Math.random() * 9000).toString()
  });
  const [newUser, setNewUser] = useState({
    email: '',
    name: '',
    role: 'sales_rep' as 'admin' | 'sales_rep',
    pinCode: Math.floor(1000 + Math.random() * 9000).toString()
  });

  const [isCreatingQuote, setIsCreatingQuote] = useState<string | null>(null); // clientId
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [editingModule, setEditingModule] = useState<ITRAKModule | null>(null);
  const [isAddingModule, setIsAddingModule] = useState(false);
  const [newModule, setNewModule] = useState<Omit<ITRAKModule, 'id'>>({
    category: '',
    name: '',
    description: '',
    monthlyCost: 0,
    setupFee: 0,
    isIncluded: false
  });
  const [userError, setUserError] = useState<string | null>(null);
  const [isAddingUserLoading, setIsAddingUserLoading] = useState(false);
  const [moduleFile, setModuleFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const BUNDLE_PRICE = 1595;

  useEffect(() => {
    const handleError = (error: any, collectionName: string) => {
      console.error(`Error in ${collectionName} snapshot listener:`, error);
      // In a real app, we'd show a toast or error boundary
    };

    const unsubClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      setClients(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ClientProfile)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'clients'));

    const unsubQuotes = onSnapshot(collection(db, 'quotes'), (snapshot) => {
      setQuotes(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Quote)));
    }, (err) => handleFirestoreError(err, OperationType.GET, 'quotes'));

    const unsubModules = onSnapshot(collection(db, 'modules'), (snapshot) => {
      if (snapshot.empty && userRole === 'admin') {
        // Seed initial modules if empty
        ITRAK_MODULES.forEach(async (m) => {
          try {
            await setDoc(doc(db, 'modules', m.id), m);
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `modules/${m.id}`);
          }
        });
      } else {
        setModules(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ITRAKModule)));
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'modules'));

    let unsubTeam = () => {};
    if (userRole === 'admin') {
      unsubTeam = onSnapshot(collection(db, 'users'), (snapshot) => {
        setTeam(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SystemUser)));
      }, (err) => handleFirestoreError(err, OperationType.GET, 'users'));
    }

    let unsubFeedback = () => {};
    if (userRole === 'admin') {
      unsubFeedback = onSnapshot(collection(db, 'feedback'), (snapshot) => {
        setFeedback(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Feedback)));
      }, (err) => handleFirestoreError(err, OperationType.GET, 'feedback'));
    }

    return () => { unsubClients(); unsubQuotes(); unsubModules(); unsubTeam(); unsubFeedback(); };
  }, [userRole]);

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'clients'), {
        ...newClient,
        createdBy: user.uid,
        createdAt: Timestamp.now()
      });
      setIsAddingClient(false);
      setNewClient({ hospitalName: '', location: '', directorName: '', email: '', pinCode: Math.floor(1000 + Math.random() * 9000).toString() });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'clients');
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAddingUserLoading) return;
    
    setUserError(null);
    if (newUser.pinCode.length < 4) {
      setUserError('PIN must be at least 4 characters long.');
      return;
    }
    
    setIsAddingUserLoading(true);
    try {
      // Check if PIN is already in use
      const pinQuery = query(collection(db, 'users'), where('pinCode', '==', newUser.pinCode));
      let pinSnap;
      try {
        pinSnap = await getDocs(pinQuery);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'users');
        return;
      }
      
      if (!pinSnap.empty) {
        setUserError('This PIN code is already in use. Please choose another one.');
        setIsAddingUserLoading(false);
        return;
      }

      // Check if Email is already in use
      let emailDoc;
      try {
        emailDoc = await getDoc(doc(db, 'users', newUser.email.toLowerCase()));
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `users/${newUser.email.toLowerCase()}`);
        return;
      }
      
      if (emailDoc.exists()) {
        setUserError('A user with this email already exists.');
        setIsAddingUserLoading(false);
        return;
      }

      // For team members, we just store them in Firestore with a PIN
      // We don't use Firebase Auth for them anymore as per user request
      
      try {
        await setDoc(doc(db, 'users', newUser.email.toLowerCase()), {
          email: newUser.email.toLowerCase(),
          name: newUser.name,
          role: newUser.role,
          pinCode: newUser.pinCode,
          createdAt: Timestamp.now()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${newUser.email.toLowerCase()}`);
      }
      
      setIsAddingUser(false);
      setUserError(null);
      setNewUser({ 
        email: '', 
        name: '', 
        role: 'sales_rep', 
        pinCode: Math.floor(1000 + Math.random() * 9000).toString() 
      });
    } catch (err: any) {
      console.error(err);
      setUserError(`Error adding user: ${err.message}`);
    } finally {
      setIsAddingUserLoading(false);
    }
  };

  const handleUpdateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModule) return;
    setIsUploading(true);
    setActionError(null);
    setActionSuccess(null);

    if (!auth.currentUser) {
      setActionError("You must be logged in to perform this action.");
      setIsUploading(false);
      return;
    }

    // Safety timeout: reset uploading state after 5 minutes if it hangs
    const timeout = setTimeout(() => {
      setIsUploading(false);
      setActionError("The request timed out. This may be due to a slow connection or a network issue. Please check your internet and try again.");
      console.error("Upload timed out after 300s");
    }, 300000);

    try {
      if (moduleFile && moduleFile.size > 25 * 1024 * 1024) {
        throw new Error("File is too large. Maximum size is 25MB.");
      }

      console.log("Starting module update for:", editingModule.id);
      let pdfUrl = editingModule.pdfUrl || '';
      
      if (moduleFile) {
        console.log("Uploading file:", moduleFile.name, "Size:", moduleFile.size);
        setUploadProgress(0);

        // Use a unique path for each upload
        const fileRef = ref(storage, `modules/${editingModule.id}_${Date.now()}.pdf`);
        
        console.log("Starting uploadBytesResumable...");
        const uploadTask = uploadBytesResumable(fileRef, moduleFile);
        
        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed', 
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
              console.log('Upload is ' + progress + '% done');
            }, 
            (error) => {
              console.error("Upload task error:", error);
              reject(error);
            }, 
            () => resolve()
          );
        });
        console.log("Upload completed successfully");

        pdfUrl = await getDownloadURL(fileRef);
        console.log("Download URL obtained:", pdfUrl);

        // Delete old file if it exists (do this AFTER successful upload)
        if (editingModule.pdfUrl && editingModule.pdfUrl.includes('firebasestorage.googleapis.com')) {
          try {
            console.log("Attempting to delete old PDF...");
            const oldFileRef = ref(storage, editingModule.pdfUrl);
            await deleteObject(oldFileRef);
            console.log("Old PDF deleted successfully");
          } catch (e) {
            console.warn("Could not delete old PDF:", e);
          }
        }
      }

      const { id, ...updateData } = editingModule;
      await updateDoc(doc(db, 'modules', id), { ...updateData, pdfUrl });
      
      clearTimeout(timeout);
      setActionSuccess("Module updated successfully!");
      
      setTimeout(() => {
        setEditingModule(null);
        setModuleFile(null);
        setActionSuccess(null);
      }, 1000);

    } catch (err: any) {
      clearTimeout(timeout);
      console.error("Detailed error in handleUpdateModule:", err);
      setActionError(`Error: ${err.message || "Unknown error occurred"}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);
    setActionError(null);
    setActionSuccess(null);

    if (!auth.currentUser) {
      setActionError("You must be logged in to perform this action.");
      setIsUploading(false);
      return;
    }

    const timeout = setTimeout(() => {
      setIsUploading(false);
      setActionError("The request timed out. This may be due to a slow connection or a network issue. Please check your internet and try again.");
      console.error("Upload timed out after 300s");
    }, 300000);

    try {
      if (moduleFile && moduleFile.size > 25 * 1024 * 1024) {
        throw new Error("File is too large. Maximum size is 25MB.");
      }

      const moduleId = newModule.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      if (!moduleId) throw new Error("Module name is invalid or empty");

      console.log("Starting module creation for:", moduleId);
      let pdfUrl = '';
      
      if (moduleFile) {
        console.log("Uploading file:", moduleFile.name, "Size:", moduleFile.size);
        setUploadProgress(0);
        const fileRef = ref(storage, `modules/${moduleId}_${Date.now()}.pdf`);
        
        console.log("Starting uploadBytesResumable...");
        const uploadTask = uploadBytesResumable(fileRef, moduleFile);
        
        await new Promise<void>((resolve, reject) => {
          uploadTask.on('state_changed', 
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
              console.log('Upload is ' + progress + '% done');
            }, 
            (error) => {
              console.error("Upload task error:", error);
              reject(error);
            }, 
            () => resolve()
          );
        });
        console.log("Upload completed successfully");

        pdfUrl = await getDownloadURL(fileRef);
        console.log("Download URL obtained:", pdfUrl);
      }

      await setDoc(doc(db, 'modules', moduleId), { ...newModule, id: moduleId, pdfUrl });

      clearTimeout(timeout);
      setActionSuccess("Module created successfully!");

      setTimeout(() => {
        setIsAddingModule(false);
        setModuleFile(null);
        setActionSuccess(null);
        setNewModule({
          category: '',
          name: '',
          description: '',
          monthlyCost: 0,
          setupFee: 0,
          isIncluded: false
        });
      }, 1000);

    } catch (err: any) {
      clearTimeout(timeout);
      console.error("Detailed error in handleAddModule:", err);
      setActionError(`Error: ${err.message || "Unknown error occurred"}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteModule = async (moduleId: string) => {
    try {
      const moduleDoc = await getDoc(doc(db, 'modules', moduleId));
      const moduleData = moduleDoc.data() as ITRAKModule;
      
      if (moduleData?.pdfUrl) {
        const fileRef = ref(storage, `modules/${moduleId}.pdf`);
        try {
          await deleteObject(fileRef);
        } catch (e) {
          console.warn("Could not delete PDF from storage (might already be gone):", e);
        }
      }
      
      await deleteDoc(doc(db, 'modules', moduleId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `modules/${moduleId}`);
    }
  };

  const handleCreateQuote = async () => {
    if (!isCreatingQuote) return;
    
    const allModules = modules.filter(m => !m.isIncluded && m.monthlyCost > 0).map(m => m.id);
    const isBundle = allModules.every(id => selectedModules.includes(id));
    
    const totalMonthly = isBundle ? BUNDLE_PRICE : modules
      .filter(m => selectedModules.includes(m.id))
      .reduce((sum, m) => sum + m.monthlyCost, 0);
    
    const setupFee = selectedModules.includes('setup-cost') ? 250 : 0;

    try {
      await addDoc(collection(db, 'quotes'), {
        clientId: isCreatingQuote,
        selectedModuleIds: selectedModules,
        totalMonthlyCost: totalMonthly,
        oneTimeFee: setupFee,
        status: 'draft',
        viewCount: 0,
        lastViewed: null,
        createdBy: user.uid,
        createdAt: Timestamp.now()
      });
      setIsCreatingQuote(null);
      setSelectedModules([]);
      setActiveTab('quotes');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'quotes');
    }
  };

  const deleteClient = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Client',
      message: 'Are you sure? This will delete the client and all their quotes.',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'clients', id));
          // Also delete related quotes
          const q = query(collection(db, 'quotes'), where('clientId', '==', id));
          const qSnap = await getDocs(q);
          qSnap.forEach(async (d) => {
            try {
              await deleteDoc(doc(db, 'quotes', d.id));
            } catch (err) {
              handleFirestoreError(err, OperationType.DELETE, `quotes/${d.id}`);
            }
          });
          setConfirmModal(null);
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `clients/${id}`);
        }
      }
    });
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans">
      {/* Sidebar */}
      <div className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-teal-500 rounded flex items-center justify-center font-bold text-white">M</div>
            <span className="font-bold text-xl tracking-tight">Medama ITRAK</span>
          </div>
          <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Quote Manager</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('clients')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
              activeTab === 'clients' ? "bg-teal-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
            )}
          >
            <Users size={20} />
            <span className="font-medium">Clients</span>
          </button>
          <button 
            onClick={() => setActiveTab('quotes')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
              activeTab === 'quotes' ? "bg-teal-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
            )}
          >
            <FileText size={20} />
            <span className="font-medium">Quotes</span>
          </button>
          {userRole === 'admin' && (
            <>
              <button 
                onClick={() => setActiveTab('modules')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                  activeTab === 'modules' ? "bg-teal-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <LayoutDashboard size={20} />
                <span className="font-medium">Modules</span>
              </button>
              <button 
                onClick={() => setActiveTab('team')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                  activeTab === 'team' ? "bg-teal-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <ShieldCheck size={20} />
                <span className="font-medium">Team</span>
              </button>
              <button 
                onClick={() => setActiveTab('feedback')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                  activeTab === 'feedback' ? "bg-teal-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <MessageSquare size={20} />
                <span className="font-medium">Feedback</span>
              </button>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden">
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate">{user.displayName}</p>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            <LogOut size={18} />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-8">
        <AnimatePresence mode="wait">
          {activeTab === 'clients' ? (
            <motion.div 
              key="clients"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-6xl mx-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">Client Profiles</h1>
                  <p className="text-slate-500">Manage hospital contacts and generate personalized access.</p>
                </div>
                <button 
                  onClick={() => setIsAddingClient(true)}
                  className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-all shadow-lg shadow-teal-600/20"
                >
                  <Plus size={20} />
                  Add Client
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {clients.map(client => (
                  <div key={client.id} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
                        <ShieldCheck size={24} />
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => deleteClient(client.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-1">{client.hospitalName}</h3>
                    <div className="space-y-2 mb-6">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <MapPin size={14} />
                        <span>{client.location}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <User size={14} />
                        <span>{client.directorName}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Lock size={14} className="text-teal-600" />
                        <span className="font-mono font-bold text-teal-600">PIN: {client.pinCode}</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => setIsCreatingQuote(client.id)}
                      className="w-full py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                    >
                      <FileText size={18} />
                      Create Quote
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : activeTab === 'quotes' ? (
            <motion.div 
              key="quotes"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-6xl mx-auto"
            >
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900">Proposals & Quotes</h1>
                <p className="text-slate-500">Review and share generated quotes with clients.</p>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Client</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Modules</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Monthly Cost</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Views</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {quotes.map(quote => {
                      const client = clients.find(c => c.id === quote.clientId);
                      return (
                        <tr key={quote.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-bold text-slate-900">{client?.hospitalName || 'Unknown'}</p>
                            <p className="text-xs text-slate-500">{client?.location}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 bg-slate-100 rounded text-xs font-medium text-slate-600">
                              {quote.selectedModuleIds.length} Modules
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-teal-600">
                            ${quote.totalMonthlyCost.toLocaleString()}/mo
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900">{quote.viewCount || 0}</span>
                              {quote.lastViewed && (
                                <span className="text-[10px] text-slate-400">
                                  {new Date(quote.lastViewed.seconds * 1000).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                              quote.status === 'sent' ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                            )}>
                              {quote.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex gap-3">
                              <button 
                                onClick={() => window.open(`?quoteId=${quote.id}`, '_blank')}
                                className="text-slate-400 hover:text-teal-600 transition-colors"
                                title="View Proposal"
                              >
                                <ExternalLink size={18} />
                              </button>
                              <button 
                                onClick={() => {
                                  const url = `${window.location.origin}?quoteId=${quote.id}`;
                                  navigator.clipboard.writeText(url);
                                  alert('Link copied to clipboard!');
                                }}
                                className="text-slate-400 hover:text-teal-600 transition-colors"
                                title="Copy Link"
                              >
                                <Send size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          ) : activeTab === 'modules' ? (
            <motion.div 
              key="modules"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-6xl mx-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">Module Management</h1>
                  <p className="text-slate-500">Adjust module names, descriptions, and pricing.</p>
                </div>
                <button 
                  onClick={() => {
                    setIsAddingModule(true);
                    setModuleFile(null);
                    setActionError(null);
                    setActionSuccess(null);
                  }}
                  className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-all shadow-lg shadow-teal-600/20"
                >
                  <Plus size={20} />
                  Add Module
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {modules.sort((a, b) => a.name.localeCompare(b.name)).map(module => (
                  <div key={module.id} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm group relative">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
                        <LayoutDashboard size={20} />
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setEditingModule(module);
                            setModuleFile(null);
                            setActionError(null);
                            setActionSuccess(null);
                          }}
                          className="text-teal-600 text-xs font-bold hover:underline"
                        >
                          Edit
                        </button>
                        <button 
                          onClick={() => setConfirmModal({
                            isOpen: true,
                            title: 'Delete Module',
                            message: `Are you sure you want to delete the module "${module.name}"? This cannot be undone.`,
                            onConfirm: () => handleDeleteModule(module.id)
                          })}
                          className="text-red-600 text-xs font-bold hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <h3 className="font-bold text-slate-900 mb-1">{module.name}</h3>
                    <p className="text-xs text-slate-500 mb-4 line-clamp-2">{module.description}</p>
                    <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Monthly Cost</span>
                        <span className="font-mono font-bold text-teal-600">${module.monthlyCost}</span>
                      </div>
                      {module.pdfUrl && (
                        <a 
                          href={module.pdfUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="w-8 h-8 bg-slate-50 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg flex items-center justify-center transition-all"
                          title="View PDF"
                        >
                          <FileDown size={18} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : activeTab === 'feedback' ? (
            <motion.div 
              key="feedback"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-6xl mx-auto"
            >
              <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900">Client Feedback</h1>
                <p className="text-slate-500">Direct insights and requests from clients viewing proposals.</p>
              </div>

              <div className="space-y-4">
                {feedback.length === 0 ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mx-auto mb-4">
                      <MessageSquare size={32} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-1">No feedback yet</h3>
                    <p className="text-slate-500">Feedback from clients will appear here once they submit it via the portal.</p>
                  </div>
                ) : (
                  feedback.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis()).map(item => (
                    <div key={item.id} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-bold text-slate-900">{item.clientName}</h3>
                          <p className="text-xs text-slate-500">
                            Quote ID: {item.quoteId} • {item.createdAt?.toDate().toLocaleString()}
                          </p>
                        </div>
                        {item.rating && (
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star 
                                key={star} 
                                size={14} 
                                className={star <= item.rating! ? "text-yellow-400 fill-yellow-400" : "text-slate-200"} 
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                        <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{item.message}</p>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button 
                          onClick={async () => {
                            if (window.confirm("Delete this feedback?")) {
                              try {
                                await deleteDoc(doc(db, 'feedback', item.id));
                              } catch (err) {
                                handleFirestoreError(err, OperationType.DELETE, `feedback/${item.id}`);
                              }
                            }
                          }}
                          className="text-xs text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1"
                        >
                          <Trash2 size={12} />
                          Delete Feedback
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="team"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-6xl mx-auto"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">Team Management</h1>
                  <p className="text-slate-500">Manage sales representatives and administrators.</p>
                </div>
                <button 
                  onClick={() => setIsAddingUser(true)}
                  className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-all shadow-lg shadow-teal-600/20"
                >
                  <Plus size={20} />
                  Add Member
                </button>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Email</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">PIN Code</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Role</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {team.map(member => (
                      <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-900">{member.name}</td>
                        <td className="px-6 py-4 text-slate-600">{member.email}</td>
                        <td className="px-6 py-4 text-slate-500 font-mono text-xs">{member.pinCode || 'N/A'}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                            member.role === 'admin' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                          )}>
                            {member.role.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button 
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: 'Remove Team Member',
                                message: 'Are you sure you want to remove this team member?',
                                onConfirm: async () => {
                                  try {
                                    await deleteDoc(doc(db, 'users', member.id));
                                    setConfirmModal(null);
                                  } catch (err) {
                                    handleFirestoreError(err, OperationType.DELETE, `users/${member.id}`);
                                  }
                                }
                              });
                            }}
                            className="text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Add Client Modal */}
      {isAddingClient && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-900">Add New Client</h2>
              <button onClick={() => setIsAddingClient(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddClient} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hospital Name</label>
                <input 
                  required
                  type="text" 
                  value={newClient.hospitalName}
                  onChange={e => setNewClient({...newClient, hospitalName: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                  placeholder="e.g. St. Jude Medical Center"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Location</label>
                <input 
                  required
                  type="text" 
                  value={newClient.location}
                  onChange={e => setNewClient({...newClient, location: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                  placeholder="e.g. Houston, TX"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Director Name</label>
                  <input 
                    required
                    type="text" 
                    value={newClient.directorName}
                    onChange={e => setNewClient({...newClient, directorName: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Access PIN</label>
                  <input 
                    required
                    type="text" 
                    value={newClient.pinCode}
                    onChange={e => setNewClient({...newClient, pinCode: e.target.value})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all font-mono font-bold text-teal-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                <input 
                  required
                  type="email" 
                  value={newClient.email}
                  onChange={e => setNewClient({...newClient, email: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                />
              </div>
              <button type="submit" className="w-full py-3 bg-teal-600 text-white rounded-lg font-bold hover:bg-teal-700 transition-all shadow-lg shadow-teal-600/20 mt-4">
                Save Profile
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddingUser && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-900">Add Team Member</h2>
              <button 
                onClick={() => {
                  setIsAddingUser(false);
                  setUserError(null);
                }} 
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
                <input 
                  required
                  type="text" 
                  value={newUser.name}
                  onChange={e => setNewUser({...newUser, name: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Address</label>
                <input 
                  required
                  type="email" 
                  value={newUser.email}
                  onChange={e => setNewUser({...newUser, email: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Login PIN Code</label>
                <div className="flex gap-2">
                  <input 
                    required
                    type="text" 
                    placeholder="Set a PIN (min 4 chars)"
                    minLength={4}
                    value={newUser.pinCode}
                    onChange={e => setNewUser({...newUser, pinCode: e.target.value.replace(/\D/g, '')})}
                    className="flex-1 px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all font-mono font-bold text-teal-600"
                  />
                  <button 
                    type="button"
                    onClick={() => setNewUser({...newUser, pinCode: Math.floor(1000 + Math.random() * 9000).toString()})}
                    className="px-3 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-all"
                    title="Regenerate PIN"
                  >
                    <Plus size={18} className="rotate-45" />
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Role</label>
                <select 
                  value={newUser.role}
                  onChange={e => setNewUser({...newUser, role: e.target.value as any})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                >
                  <option value="sales_rep">Sales Representative</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>

              {userError && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600 font-medium">
                  {userError}
                </div>
              )}

              <button 
                disabled={isAddingUserLoading}
                type="submit" 
                className="w-full py-3 bg-teal-600 text-white rounded-lg font-bold hover:bg-teal-700 transition-all shadow-lg shadow-teal-600/20 mt-4 disabled:opacity-50"
              >
                {isAddingUserLoading ? 'Adding...' : 'Add Member'}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Edit Module Modal */}
      {editingModule && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-900">Edit Module</h2>
              <button onClick={() => { setEditingModule(null); setActionError(null); setModuleFile(null); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleUpdateModule} className="p-6 space-y-4">
              {actionError && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs font-medium">
                  {actionError}
                </div>
              )}
              {actionSuccess && (
                <div className="p-3 bg-teal-50 border border-teal-100 rounded-lg text-teal-600 text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  {actionSuccess}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Module Name</label>
                <input 
                  required
                  type="text" 
                  value={editingModule.name}
                  onChange={e => setEditingModule({...editingModule, name: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
                <textarea 
                  required
                  rows={3}
                  value={editingModule.description}
                  onChange={e => setEditingModule({...editingModule, description: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Monthly Cost ($)</label>
                <input 
                  required
                  type="number" 
                  value={editingModule.monthlyCost}
                  onChange={e => setEditingModule({...editingModule, monthlyCost: Number(e.target.value)})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Information PDF (Optional)</label>
                <div className="relative">
                  <input 
                    type="file" 
                    accept=".pdf"
                    onChange={e => setModuleFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="edit-module-pdf"
                  />
                  <label 
                    htmlFor="edit-module-pdf"
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-all"
                  >
                    <FileUp size={18} className="text-slate-400" />
                    <span className="text-sm text-slate-600 font-medium truncate max-w-[200px]">
                      {moduleFile ? moduleFile.name : (editingModule.pdfUrl ? 'Replace current PDF' : 'Upload PDF')}
                    </span>
                  </label>
                  {editingModule.pdfUrl && !moduleFile && (
                    <button 
                      type="button"
                      onClick={async () => {
                        if (window.confirm("Are you sure you want to remove the PDF from this module?")) {
                          try {
                            const fileRef = ref(storage, editingModule.pdfUrl!);
                            await deleteObject(fileRef);
                            await updateDoc(doc(db, 'modules', editingModule.id), { pdfUrl: '' });
                            setEditingModule({...editingModule, pdfUrl: ''});
                            setActionSuccess("PDF removed successfully!");
                            setTimeout(() => setActionSuccess(null), 2000);
                          } catch (err: any) {
                            setActionError(`Error removing PDF: ${err.message}`);
                          }
                        }
                      }}
                      className="absolute -top-2 -right-2 bg-red-100 text-red-600 p-1 rounded-full hover:bg-red-200 transition-colors shadow-sm"
                      title="Remove PDF"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                {editingModule.pdfUrl && !moduleFile && (
                  <p className="text-[10px] text-teal-600 mt-1 font-medium flex items-center gap-1">
                    <CheckCircle2 size={10} /> PDF already uploaded
                  </p>
                )}
              </div>
              <button 
                disabled={isUploading}
                type="submit" 
                className="w-full py-3 bg-teal-600 text-white rounded-lg font-bold hover:bg-teal-700 transition-all shadow-lg shadow-teal-600/20 mt-4 disabled:opacity-50 relative overflow-hidden"
              >
                {isUploading && (
                  <div 
                    className="absolute inset-0 bg-teal-500/50 transition-all duration-300" 
                    style={{ width: `${uploadProgress}%` }}
                  />
                )}
                <span className="relative z-10">
                  {isUploading ? `Uploading ${Math.round(uploadProgress)}%` : 'Update Module'}
                </span>
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Add Module Modal */}
      {isAddingModule && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-900">Add New Module</h2>
              <button onClick={() => { setIsAddingModule(false); setActionError(null); setModuleFile(null); }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddModule} className="p-6 space-y-4">
              {actionError && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-xs font-medium">
                  {actionError}
                </div>
              )}
              {actionSuccess && (
                <div className="p-3 bg-teal-50 border border-teal-100 rounded-lg text-teal-600 text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 size={14} />
                  {actionSuccess}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Module Name</label>
                <input 
                  required
                  type="text" 
                  value={newModule.name}
                  onChange={e => setNewModule({...newModule, name: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                  placeholder="e.g. Advanced Analytics"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
                <input 
                  required
                  type="text" 
                  value={newModule.category}
                  onChange={e => setNewModule({...newModule, category: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                  placeholder="e.g. Enterprise Analytics"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
                <textarea 
                  required
                  rows={3}
                  value={newModule.description}
                  onChange={e => setNewModule({...newModule, description: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all text-sm"
                  placeholder="Describe what this module does..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Monthly Cost ($)</label>
                  <input 
                    required
                    type="number" 
                    value={newModule.monthlyCost}
                    onChange={e => setNewModule({...newModule, monthlyCost: Number(e.target.value)})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Setup Fee ($)</label>
                  <input 
                    type="number" 
                    value={newModule.setupFee}
                    onChange={e => setNewModule({...newModule, setupFee: Number(e.target.value)})}
                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all font-mono"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="isIncluded"
                  checked={newModule.isIncluded}
                  onChange={e => setNewModule({...newModule, isIncluded: e.target.checked})}
                  className="w-4 h-4 text-teal-600 border-slate-300 rounded focus:ring-teal-500"
                />
                <label htmlFor="isIncluded" className="text-sm text-slate-700 font-medium cursor-pointer">
                  Always included in base package
                </label>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Information PDF (Optional)</label>
                <div className="relative">
                  <input 
                    type="file" 
                    accept=".pdf"
                    onChange={e => setModuleFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="add-module-pdf"
                  />
                  <label 
                    htmlFor="add-module-pdf"
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-all"
                  >
                    <FileUp size={18} className="text-slate-400" />
                    <span className="text-sm text-slate-600 font-medium truncate max-w-[200px]">
                      {moduleFile ? moduleFile.name : 'Upload PDF'}
                    </span>
                  </label>
                </div>
              </div>
              <button 
                disabled={isUploading}
                type="submit" 
                className="w-full py-3 bg-teal-600 text-white rounded-lg font-bold hover:bg-teal-700 transition-all shadow-lg shadow-teal-600/20 mt-4 disabled:opacity-50 relative overflow-hidden"
              >
                {isUploading && (
                  <div 
                    className="absolute inset-0 bg-teal-500/50 transition-all duration-300" 
                    style={{ width: `${uploadProgress}%` }}
                  />
                )}
                <span className="relative z-10">
                  {isUploading ? `Uploading ${Math.round(uploadProgress)}%` : 'Create Module'}
                </span>
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
          >
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">{confirmModal.title}</h3>
              <p className="text-slate-500 mb-6">{confirmModal.message}</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    confirmModal.onConfirm();
                    setConfirmModal(null);
                  }}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                >
                  Confirm
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Create Quote Modal */}
      {isCreatingQuote && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
          >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Build Proposal</h2>
                <p className="text-sm text-slate-500">Select modules to include for {clients.find(c => c.id === isCreatingQuote)?.hospitalName}</p>
              </div>
              <button onClick={() => setIsCreatingQuote(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            
            <div className="flex-1 overflow-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {modules.map(module => (
                <div 
                  key={module.id} 
                  onClick={() => {
                    if (selectedModules.includes(module.id)) {
                      setSelectedModules(selectedModules.filter(id => id !== module.id));
                    } else {
                      setSelectedModules([...selectedModules, module.id]);
                    }
                  }}
                  className={cn(
                    "p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3",
                    selectedModules.includes(module.id) 
                      ? "border-teal-500 bg-teal-50" 
                      : "border-slate-100 hover:border-slate-200"
                  )}
                >
                  <div className={cn(
                    "w-5 h-5 rounded border mt-1 flex items-center justify-center",
                    selectedModules.includes(module.id) ? "bg-teal-500 border-teal-500 text-white" : "border-slate-300"
                  )}>
                    {selectedModules.includes(module.id) && <CheckCircle2 size={14} />}
                  </div>
                  <div>
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        {module.name}
                        {module.pdfUrl && <FileDown size={12} className="text-teal-500" title="PDF available" />}
                      </h4>
                      <span className="text-xs font-mono font-bold text-teal-600">
                        {module.monthlyCost > 0 ? `$${module.monthlyCost}/mo` : (module.setupFee ? `$${module.setupFee} (One-time)` : 'Included')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{module.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Estimated Monthly Total</p>
                <p className="text-2xl font-bold text-slate-900">
                  ${modules.filter(m => selectedModules.includes(m.id)).reduce((s, m) => s + m.monthlyCost, 0).toLocaleString()}
                  <span className="text-sm font-normal text-slate-500 ml-1">/ month</span>
                </p>
              </div>
              <button 
                disabled={selectedModules.length === 0}
                onClick={handleCreateQuote}
                className="bg-slate-900 text-white px-8 py-3 rounded-lg font-bold hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Generate Quote
                <ArrowRight size={18} />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

const ClientPortal = ({ quoteId }: { quoteId: string }) => {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [modules, setModules] = useState<ITRAKModule[]>([]);
  const [pin, setPin] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<'proposal' | 'roi' | 'insights' | 'feedback'>('proposal');
  const [loading, setLoading] = useState(true);
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const BUNDLE_PRICE = 1595;

  useEffect(() => {
    const fetchQuote = async () => {
      const qDoc = await getDoc(doc(db, 'quotes', quoteId));
      if (qDoc.exists()) {
        const qData = qDoc.data() as Quote;
        setQuote(qData);
        setSelectedModuleIds(qData.selectedModuleIds);
        const cDoc = await getDoc(doc(db, 'clients', qData.clientId));
        if (cDoc.exists()) setClient(cDoc.data() as ClientProfile);
      }
      
      const mSnap = await getDocs(collection(db, 'modules'));
      setModules(mSnap.docs.map(d => ({ id: d.id, ...d.data() } as ITRAKModule)));
      
      setLoading(false);
    };
    fetchQuote();
  }, [quoteId]);

  const handleUnlock = async () => {
    if (client && pin === client.pinCode) {
      setIsUnlocked(true);
      // Track view
      if (quote) {
        await updateDoc(doc(db, 'quotes', quoteId), {
          viewCount: (quote.viewCount || 0) + 1,
          lastViewed: Timestamp.now()
        });
      }
    } else {
      alert('Invalid PIN code. Please check your invitation email.');
    }
  };

  const toggleModule = (id: string) => {
    setSelectedModuleIds(prev => 
      prev.includes(id) ? prev.filter(mid => mid !== id) : [...prev, id]
    );
  };

  const calculateTotal = () => {
    const allModules = modules.filter(m => !m.isIncluded && m.monthlyCost > 0).map(m => m.id);
    const isBundle = allModules.length > 0 && allModules.every(id => selectedModuleIds.includes(id));
    
    if (isBundle) return BUNDLE_PRICE;
    
    return modules
      .filter(m => selectedModuleIds.includes(m.id))
      .reduce((sum, m) => sum + m.monthlyCost, 0);
  };

  const isBundleActive = () => {
    const allModules = modules.filter(m => !m.isIncluded && m.monthlyCost > 0).map(m => m.id);
    return allModules.length > 0 && allModules.every(id => selectedModuleIds.includes(id));
  };

  const activateBundle = () => {
    const allModules = modules.filter(m => !m.isIncluded && m.monthlyCost > 0).map(m => m.id);
    setSelectedModuleIds(allModules);
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackMessage.trim()) return;
    if (!client) return;
    
    setIsSubmittingFeedback(true);
    try {
      await addDoc(collection(db, 'feedback'), {
        quoteId,
        clientId: client.id,
        clientName: client.hospitalName,
        message: feedbackMessage,
        rating: feedbackRating,
        createdAt: Timestamp.now()
      });
      setFeedbackSubmitted(true);
      setFeedbackMessage('');
      setFeedbackRating(0);
    } catch (err) {
      console.error("Error submitting feedback:", err);
      alert("Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback to opening in new tab if fetch fails
      window.open(url, '_blank');
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-900 text-white">Loading proposal...</div>;
  if (!quote || !client) return <div className="h-screen flex items-center justify-center bg-slate-900 text-white">Proposal not found.</div>;

  if (!isUnlocked) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-900 p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl text-center"
        >
          <div className="w-20 h-20 bg-teal-500 rounded-2xl mx-auto mb-6 flex items-center justify-center text-white shadow-xl shadow-teal-500/20">
            <Lock size={40} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Secure Proposal Access</h1>
          <p className="text-slate-500 mb-8">Please enter the unique PIN code provided in your invitation to view the Medama ITRAK proposal for {client.hospitalName}.</p>
          
          <div className="space-y-4">
            <input 
              type="password" 
              maxLength={6}
              value={pin}
              onChange={e => setPin(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUnlock()}
              className="w-full text-center text-3xl tracking-[1em] font-mono py-4 border-2 border-slate-100 rounded-2xl focus:border-teal-500 outline-none transition-all"
              placeholder="••••"
            />
            <button 
              onClick={handleUnlock}
              className="w-full py-4 bg-teal-600 text-white rounded-2xl font-bold text-lg hover:bg-teal-700 transition-all shadow-lg shadow-teal-600/20"
            >
              Unlock Proposal
            </button>
          </div>
          <p className="mt-6 text-xs text-slate-400">
            Confidential information intended for {client.directorName}
          </p>
        </motion.div>
      </div>
    );
  }

  const selectedModules = modules.filter(m => selectedModuleIds.includes(m.id));
  const totalMonthly = calculateTotal();

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      {/* Header */}
      <header className="bg-slate-900 text-white sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-500 rounded-lg flex items-center justify-center font-bold text-white text-xl">M</div>
            <div>
              <h2 className="font-bold text-lg leading-tight">Medama ITRAK</h2>
              <p className="text-[10px] text-teal-400 uppercase tracking-widest font-bold">Smart Tracking. Smarter Operations.</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Prepared For</p>
              <p className="font-bold text-sm">{client.hospitalName}</p>
            </div>
            <a 
              href="mailto:reports@acejan.com?subject=Demo Request - ITRAK Quote"
              className="bg-teal-500 hover:bg-teal-400 text-slate-900 px-5 py-2 rounded-full font-bold text-sm transition-all"
            >
              Schedule Demo
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-slate-900 text-white py-16 px-6 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none">
          <BarChart3 size={400} className="text-teal-500 rotate-12 translate-x-1/4" />
        </div>
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="max-w-2xl"
          >
            <span className="inline-block px-3 py-1 bg-teal-500/20 text-teal-400 rounded-full text-xs font-bold uppercase tracking-widest mb-4">
              Personalized Technology Proposal
            </span>
            <h1 className="text-5xl md:text-6xl font-black mb-6 leading-tight">
              Modernizing Facility Operations at <span className="text-teal-400">{client.hospitalName}</span>
            </h1>
            <p className="text-xl text-slate-400 mb-8 leading-relaxed">
              A comprehensive, cloud-based platform designed to enhance efficiency, compliance, and real-time visibility across your departments.
            </p>
            <div className="flex flex-wrap gap-4">
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center gap-4">
                <div className="w-12 h-12 bg-teal-500/20 rounded-xl flex items-center justify-center text-teal-400">
                  <BarChart3 size={24} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Estimated ROI</p>
                  <p className="text-xl font-bold">28% Efficiency Gain</p>
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center gap-4">
                <div className="w-12 h-12 bg-teal-500/20 rounded-xl flex items-center justify-center text-teal-400">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Compliance</p>
                  <p className="text-xl font-bold">100% Audit Ready</p>
                </div>
              </div>
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center gap-4">
                <div className="w-12 h-12 bg-teal-500/20 rounded-xl flex items-center justify-center text-teal-400">
                  <Users size={24} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Satisfaction</p>
                  <p className="text-xl font-bold">+35% Patient Score</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-slate-200 sticky top-[72px] z-30">
        <div className="max-w-7xl mx-auto px-6 flex gap-8">
          {[
            { id: 'proposal', label: 'Module Overview', icon: FileText },
            { id: 'roi', label: 'Benefits & ROI', icon: BarChart3 },
            { id: 'insights', label: 'Strategic Insights', icon: Info },
            { id: 'feedback', label: 'Feedback', icon: Send }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 py-4 font-bold text-sm transition-all relative",
                activeTab === tab.id ? "text-teal-600" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <tab.icon size={18} />
              {tab.label}
              {activeTab === tab.id && (
                <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-teal-600 rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {activeTab === 'proposal' && (
            <motion.div
              key="proposal"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                  <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                      <h3 className="font-bold text-slate-900">Module Selection Menu</h3>
                      <p className="text-xs text-slate-500">Toggle modules to customize your solution</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {modules.map(module => (
                        <div 
                          key={module.id} 
                          onClick={() => toggleModule(module.id)}
                          className={cn(
                            "p-6 flex items-start gap-4 cursor-pointer transition-colors",
                            selectedModuleIds.includes(module.id) ? "bg-teal-50/30" : "hover:bg-slate-50"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all",
                            selectedModuleIds.includes(module.id) ? "bg-teal-500 text-white" : "bg-slate-100 text-slate-400"
                          )}>
                            <CheckCircle2 size={20} />
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between items-start mb-1">
                              <h4 className={cn("font-bold transition-colors", selectedModuleIds.includes(module.id) ? "text-slate-900" : "text-slate-500")}>
                                {module.name}
                              </h4>
                              <span className="text-sm font-mono font-bold text-teal-600">
                                {module.monthlyCost > 0 ? `$${module.monthlyCost}/mo` : (module.setupFee ? `$${module.setupFee} (One-time)` : 'Included')}
                              </span>
                            </div>
                            <p className="text-sm text-slate-500 leading-relaxed">{module.description}</p>
                            {module.pdfUrl && (
                              <div className="mt-3 flex gap-2" onClick={e => e.stopPropagation()}>
                                <a 
                                  href={module.pdfUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition-all"
                                >
                                  <Eye size={12} />
                                  View PDF
                                </a>
                                <button 
                                  onClick={() => handleDownload(module.pdfUrl!, module.name)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-100 hover:bg-teal-200 text-teal-700 rounded-lg text-[10px] font-bold transition-all"
                                >
                                  <Download size={12} />
                                  Download
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-xl">
                    <h3 className="text-xl font-bold mb-6">Investment Summary</h3>
                    <div className="space-y-4 mb-8">
                      <div className="flex justify-between items-center text-slate-400">
                        <span>Monthly Subscription</span>
                        <span className="font-mono font-bold text-white">${totalMonthly.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-400">
                        <span>One-time Setup Fee</span>
                        <span className="font-mono font-bold text-white">${quote.oneTimeFee.toLocaleString()}</span>
                      </div>
                      {isBundleActive() && (
                        <div className="flex justify-between items-center text-teal-400 text-xs font-bold uppercase tracking-wider">
                          <span>Enterprise Discount Applied</span>
                          <span>Active</span>
                        </div>
                      )}
                      <div className="pt-4 border-t border-white/10 flex justify-between items-end">
                        <span className="text-teal-400 font-bold uppercase tracking-widest text-xs">Total Monthly</span>
                        <span className="text-4xl font-black">${totalMonthly.toLocaleString()}</span>
                      </div>
                    </div>
                    <a 
                      href="mailto:reports@acejan.com?subject=Accept Proposal - ITRAK"
                      className="w-full py-4 bg-teal-500 text-slate-900 rounded-2xl font-black text-center block hover:bg-teal-400 transition-all shadow-lg shadow-teal-500/20"
                    >
                      Accept Proposal
                    </a>
                    <p className="text-[10px] text-center text-slate-500 mt-4 uppercase tracking-widest font-bold">
                      Pricing valid for 30 days
                    </p>
                  </div>

                  {!isBundleActive() && (
                    <div className="bg-teal-600 rounded-3xl p-6 text-white shadow-lg shadow-teal-600/20">
                      <h4 className="font-bold mb-2 flex items-center gap-2">
                        <ShieldCheck size={18} />
                        Enterprise Bundle
                      </h4>
                      <p className="text-sm text-teal-100 mb-4">Get the entire ITRAK suite for a flat monthly rate and save significantly.</p>
                      <div className="flex items-end gap-2 mb-4">
                        <span className="text-3xl font-black">$1,595</span>
                        <span className="text-xs text-teal-200 mb-1">/ month</span>
                      </div>
                      <button 
                        onClick={activateBundle}
                        className="w-full py-3 bg-white text-teal-600 rounded-xl font-bold hover:bg-teal-50 transition-all"
                      >
                        Activate All Modules
                      </button>
                    </div>
                  )}

                  <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                    <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <Calendar size={18} className="text-teal-600" />
                      Next Steps
                    </h4>
                    <ul className="space-y-4">
                      {[
                        "Schedule a live department demo",
                        "Review technical requirements",
                        "Finalize implementation timeline",
                        "Onboard leadership team"
                      ].map((step, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                          <span className="w-5 h-5 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">{i+1}</span>
                          {step}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'roi' && (
            <motion.div
              key="roi"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { title: 'Labor Efficiency', value: '22%', desc: 'Reduction in administrative reporting and manual logs.', icon: Users },
                  { title: 'Asset Savings', value: '$12k/yr', desc: 'Average reduction in premature equipment replacement.', icon: ShieldCheck },
                  { title: 'Patient Satisfaction', value: '+35%', desc: 'Increase in HCAHPS scores via rapid QR response.', icon: CheckCircle2 },
                  { title: 'Broken Equipment', value: '-40%', desc: 'Decrease in downtime through proactive GPS tracking.', icon: Trash2 }
                ].map((item, i) => (
                  <div key={i} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm text-center">
                    <div className="w-12 h-12 bg-teal-50 rounded-2xl mx-auto mb-4 flex items-center justify-center text-teal-600">
                      <item.icon size={24} />
                    </div>
                    <h3 className="text-3xl font-black text-slate-900 mb-1">{item.value}</h3>
                    <p className="font-bold text-slate-900 text-sm mb-1">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                  <h3 className="text-xl font-bold text-slate-900 mb-6">Patient & Customer Satisfaction</h3>
                  <p className="text-slate-600 mb-6 leading-relaxed">
                    By implementing the <strong>QR Code Ticket System</strong>, you empower patients and visitors to communicate directly with your EVS department. This "Instant Feedback Loop" eliminates the delay of traditional reporting channels.
                  </p>
                  <ul className="space-y-4">
                    <li className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center shrink-0 mt-0.5"><CheckCircle2 size={14} /></div>
                      <p className="text-sm text-slate-700"><strong>Service Recovery:</strong> Resolve issues before the patient leaves the room.</p>
                    </li>
                    <li className="flex items-start gap-3">
                      <div className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center shrink-0 mt-0.5"><CheckCircle2 size={14} /></div>
                      <p className="text-sm text-slate-700"><strong>Transparency:</strong> Leadership sees exactly where bottlenecks occur in real-time.</p>
                    </li>
                  </ul>
                </div>
                <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                  <h3 className="text-xl font-bold text-slate-900 mb-8">Projected Operational Efficiency (12 Months)</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={[
                          { month: 'Month 1', efficiency: 65, compliance: 70 },
                          { month: 'Month 3', efficiency: 72, compliance: 82 },
                          { month: 'Month 6', efficiency: 85, compliance: 90 },
                          { month: 'Month 9', efficiency: 92, compliance: 96 },
                          { month: 'Month 12', efficiency: 98, compliance: 100 },
                        ]}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="month" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} 
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} 
                        />
                        <Tooltip 
                          cursor={{ fill: '#f8fafc' }}
                          contentStyle={{ 
                            borderRadius: '16px', 
                            border: 'none', 
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            padding: '12px'
                          }}
                        />
                        <Legend 
                          verticalAlign="top" 
                          align="right" 
                          iconType="circle"
                          wrapperStyle={{ paddingBottom: '20px', fontSize: '12px', fontWeight: 600 }}
                        />
                        <Bar 
                          dataKey="efficiency" 
                          name="Efficiency %" 
                          fill="#0d9488" 
                          radius={[6, 6, 0, 0]} 
                          barSize={32}
                        />
                        <Bar 
                          dataKey="compliance" 
                          name="Compliance %" 
                          fill="#0f172a" 
                          radius={[6, 6, 0, 0]} 
                          barSize={32}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      * Projections based on average ITRAK implementation results across similar facility sizes. Efficiency gains reflect reduced manual logging and automated reporting.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'insights' && (
            <motion.div
              key="insights"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                <h3 className="text-xl font-bold text-slate-900 mb-6">Strategic Operational Advantages</h3>
                <div className="space-y-8">
                  {[
                    { 
                      title: "Real-Time Visibility & Accountability", 
                      text: "Instantly monitor machine health, dispenser usage, and employee performance from any device. Our geofencing technology ensures that staff are exactly where they need to be, eliminating 'ghost shifts' and location fraud.",
                      benefit: "Reduces labor waste by up to 18%."
                    },
                    { 
                      title: "AI-Driven Cleaning Intelligence", 
                      text: "The ITRAK AI Assistant uses ISSA-based photo analysis to generate space-specific cleaning recommendations. This ensures that high-traffic clinical areas receive the exact level of sanitation required by regulatory standards.",
                      benefit: "Ensures 100% compliance with infection control protocols."
                    },
                    { 
                      title: "Predictive Asset Management", 
                      text: "Stop reacting to broken equipment. ITRAK tracks purchase price, hours used, and life expectancy. Automated alerts notify your team before a machine fails, allowing for scheduled maintenance instead of costly emergency repairs.",
                      benefit: "Extends equipment life by an average of 3.2 years."
                    },
                    { 
                      title: "Dynamic Supply Chain Control", 
                      text: "The MyOrders and Budgets modules provide granular control over supply spend by hospital and location. Track outpatient supply delivery and usage by hub to eliminate over-ordering and waste.",
                      benefit: "Reduces supply spend by 12-15% annually."
                    }
                  ].map((insight, i) => (
                    <div key={i} className="flex gap-6">
                      <div className="w-10 h-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-sm font-bold shrink-0">{i+1}</div>
                      <div>
                        <h4 className="font-bold text-slate-900 mb-2">{insight.title}</h4>
                        <p className="text-sm text-slate-500 leading-relaxed mb-3">{insight.text}</p>
                        <div className="inline-block px-3 py-1 bg-teal-50 text-teal-700 rounded-lg text-xs font-bold">
                          Key Impact: {insight.benefit}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-900 rounded-3xl p-8 text-white flex flex-col justify-center items-center text-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-teal-500/20 to-transparent pointer-events-none" />
                  <h3 className="text-2xl font-black mb-6 relative z-10">Ready to transform your operations?</h3>
                  <p className="text-slate-400 mb-8 relative z-10 text-sm">
                    Join the leading healthcare facilities using Medama ITRAK to drive accountability and excellence.
                  </p>
                  <a 
                    href="mailto:reports@acejan.com?subject=Demo Request - ITRAK Quote"
                    className="w-full py-4 bg-teal-500 text-slate-900 rounded-2xl font-black text-lg hover:bg-teal-400 transition-all shadow-xl shadow-teal-500/30 relative z-10"
                  >
                    Schedule Demo
                  </a>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
                  <h4 className="font-bold text-slate-900 mb-4">Implementation Timeline</h4>
                  <div className="space-y-4">
                    {[
                      { week: 'Week 1', task: 'Site Survey & Mapping' },
                      { week: 'Week 2', task: 'Hardware & QR Deployment' },
                      { week: 'Week 3', task: 'Leadership Training' },
                      { week: 'Week 4', task: 'Go-Live & Support' }
                    ].map((step, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-teal-600 w-12">{step.week}</span>
                        <div className="flex-1 h-px bg-slate-100" />
                        <span className="text-xs text-slate-600">{step.task}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'feedback' && (
            <motion.div
              key="feedback"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center text-teal-600 mx-auto mb-4">
                    <Send size={32} />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900">Direct Feedback</h3>
                  <p className="text-slate-500">Share your thoughts, questions, or requested adjustments to this proposal.</p>
                </div>

                {feedbackSubmitted ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-teal-50 border border-teal-100 rounded-2xl p-8 text-center"
                  >
                    <div className="w-12 h-12 bg-teal-500 text-white rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 size={24} />
                    </div>
                    <h4 className="text-lg font-bold text-slate-900 mb-2">Feedback Received!</h4>
                    <p className="text-slate-600 mb-6">Thank you for your input. Our team will review your comments and get back to you shortly.</p>
                    <button 
                      onClick={() => setFeedbackSubmitted(false)}
                      className="text-teal-600 font-bold hover:underline"
                    >
                      Send another message
                    </button>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSubmitFeedback} className="space-y-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">How would you rate this proposal?</label>
                      <div className="flex gap-4">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setFeedbackRating(star)}
                            className={cn(
                              "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                              feedbackRating >= star ? "bg-teal-500 text-white shadow-lg shadow-teal-500/20" : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                            )}
                          >
                            <Star size={20} fill={feedbackRating >= star ? "currentColor" : "none"} />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Your Message</label>
                      <textarea 
                        required
                        rows={6}
                        value={feedbackMessage}
                        onChange={e => setFeedbackMessage(e.target.value)}
                        placeholder="Tell us what you think, any modules you'd like to add/remove, or any questions you have..."
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-teal-500 outline-none transition-all text-sm leading-relaxed"
                      />
                    </div>

                    <button 
                      type="submit"
                      disabled={isSubmittingFeedback || !feedbackMessage.trim()}
                      className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSubmittingFeedback ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send size={18} />
                          Submit Feedback
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Mobile Demo CTA */}
      <div className="md:hidden fixed bottom-6 left-6 right-6 z-50">
        <a 
          href="mailto:reports@acejan.com?subject=Demo Request - ITRAK Quote"
          className="w-full py-4 bg-teal-600 text-white rounded-2xl font-bold text-center block shadow-2xl shadow-teal-600/40"
        >
          Schedule Demo
        </a>
      </div>
    </div>
  );
};

// --- Registration Page Component ---
const RegistrationPage = () => {
  const [formData, setFormData] = useState({
    hospitalName: '',
    location: '',
    directorName: '',
    email: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const pinCode = Math.floor(1000 + Math.random() * 9000).toString();
      await addDoc(collection(db, 'clients'), {
        ...formData,
        pinCode,
        createdBy: 'public_registration',
        createdAt: Timestamp.now()
      });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      alert('There was an error submitting your information. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-[40px] p-12 shadow-2xl text-center"
        >
          <div className="w-20 h-20 bg-teal-100 text-teal-600 rounded-3xl mx-auto mb-8 flex items-center justify-center">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-4">Registration Successful!</h2>
          <p className="text-slate-500 mb-8">
            Thank you for your interest in Medama ITRAK. Our team will review your information and send you a personalized quote shortly.
          </p>
          <button 
            onClick={() => window.location.href = '/'}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all"
          >
            Back to Home
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6 flex items-center justify-center relative overflow-hidden">
      {/* Background Accents */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-500/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-teal-500/5 blur-[120px] rounded-full" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl w-full bg-white rounded-[40px] p-10 shadow-2xl relative z-10"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 bg-teal-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-teal-500/20">
            <LayoutDashboard size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Medama ITRAK</h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Client Registration</p>
          </div>
        </div>

        <h2 className="text-3xl font-black text-slate-900 mb-2">Request a Quote</h2>
        <p className="text-slate-500 mb-8">Please provide your facility details to receive a personalized Medama ITRAK proposal.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Hospital / Facility Name</label>
            <div className="relative">
              <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                required
                type="text"
                placeholder="Enter hospital name"
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                value={formData.hospitalName}
                onChange={e => setFormData({...formData, hospitalName: e.target.value})}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Location (City, State)</label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                required
                type="text"
                placeholder="e.g. New York, NY"
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                value={formData.location}
                onChange={e => setFormData({...formData, location: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Director Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  required
                  type="text"
                  placeholder="Full name"
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                  value={formData.directorName}
                  onChange={e => setFormData({...formData, directorName: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  required
                  type="email"
                  placeholder="work@email.com"
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                />
              </div>
            </div>
          </div>

          <button 
            disabled={loading}
            type="submit"
            className="w-full py-5 bg-teal-500 text-slate-900 rounded-2xl font-black text-xl hover:bg-teal-400 transition-all flex items-center justify-center gap-3 shadow-xl shadow-teal-500/20 disabled:opacity-50"
          >
            {loading ? 'Submitting...' : (
              <>
                Register Facility
                <ArrowRight size={24} />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-slate-400 text-xs mt-8 font-medium">
          By registering, you agree to our terms of service and privacy policy.
        </p>
      </motion.div>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'sales_rep' | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'admin' | 'client' | 'register'>('client');
  const [quoteId, setQuoteId] = useState<string | null>(null);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginMode, setLoginMode] = useState<'admin' | 'team'>('team');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isRegisteringAdmin, setIsRegisteringAdmin] = useState(false);

  useEffect(() => {
    const testConnection = async () => {
      try {
        const { getDocFromServer } = await import('firebase/firestore');
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
      }
    };
    testConnection();

    // Check for quoteId or view in URL
    const params = new URLSearchParams(window.location.search);
    const qid = params.get('quoteId');
    const viewParam = params.get('view');

    if (qid) {
      setQuoteId(qid);
      setView('client');
    } else if (viewParam === 'register') {
      setView('register');
    } else {
      setView('admin');
    }

    // Check for persisted PIN login
    const savedPinUser = localStorage.getItem('pinUser');
    if (savedPinUser) {
      const parsed = JSON.parse(savedPinUser);
      setUser(parsed.user);
      setUserRole(parsed.role);
    }

    const unsub = auth.onAuthStateChanged(async (u) => {
      if (u) {
        setUser(u);
        // Fetch role
        if (u.email === 'elmejor15@gmail.com' || u.email === 'regis@acejan.com') {
          setUserRole('admin');
        } else {
          const q = query(collection(db, 'users'), where('email', '==', u.email?.toLowerCase()));
          const snap = await getDocs(q);
          if (!snap.empty) {
            setUserRole(snap.docs[0].data().role as any);
          } else {
            setUserRole(null);
          }
        }
      } else {
        // Only clear if not a PIN login
        const isPinLogin = localStorage.getItem('pinUser');
        if (!isPinLogin) {
          setUser(null);
          setUserRole(null);
        }
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      if (isRegisteringAdmin) {
        await createUserWithEmailAndPassword(auth, loginEmail, loginPassword);
        alert('Admin account created successfully! You are now logged in.');
      } else {
        await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setAuthError('Email/Password login is not enabled in your Firebase Console. Please go to Authentication > Sign-in method and enable it.');
      } else if (err.code === 'auth/email-already-in-use') {
        setAuthError('This email is already registered. Please try signing in.');
      } else if (err.code === 'auth/weak-password') {
        setAuthError('Password is too weak. Please use a stronger password.');
      } else {
        setAuthError('Invalid email or password. Please try again.');
      }
    }
  };

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const q = query(collection(db, 'users'), where('pinCode', '==', loginPin));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const userData = snap.docs[0].data();
        const pinUser = {
          uid: snap.docs[0].id,
          email: userData.email,
          displayName: userData.name,
          isPinLogin: true
        };
        setUser(pinUser);
        setUserRole(userData.role);
        localStorage.setItem('pinUser', JSON.stringify({ user: pinUser, role: userData.role }));
      } else {
        setAuthError('Invalid PIN code. Please try again.');
      }
    } catch (err: any) {
      console.error(err);
      setAuthError('An error occurred. Please try again.');
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem('pinUser');
    if (user?.isPinLogin) {
      setUser(null);
      setUserRole(null);
    } else {
      await signOut(auth);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-900 text-white">Loading...</div>;

  if (view === 'register') {
    return <RegistrationPage />;
  }

  if (view === 'client' && quoteId) {
    return <ClientPortal quoteId={quoteId} />;
  }

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-900 p-6 relative overflow-hidden">
        {/* Background Accents */}
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-teal-500/5 blur-[120px] rounded-full" />

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg bg-white rounded-[40px] p-12 shadow-2xl text-center relative z-10"
        >
          <div className="w-24 h-24 bg-teal-500 rounded-3xl mx-auto mb-8 flex items-center justify-center text-white shadow-2xl shadow-teal-500/20">
            <LayoutDashboard size={48} />
          </div>
          <h1 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Medama ITRAK</h1>
          <p className="text-slate-500 mb-8 text-lg leading-relaxed">
            Internal Quote Management System. <br />
            <span className="font-bold text-slate-900 text-sm">Authorized access only.</span>
          </p>

          {authError && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium border border-red-100">
              {authError}
            </div>
          )}

          <div className="flex bg-slate-100 p-1 rounded-2xl mb-8">
            <button 
              onClick={() => { setLoginMode('team'); setAuthError(null); }}
              className={cn(
                "flex-1 py-3 rounded-xl font-bold transition-all",
                loginMode === 'team' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Team Login
            </button>
            <button 
              onClick={() => { setLoginMode('admin'); setAuthError(null); }}
              className={cn(
                "flex-1 py-3 rounded-xl font-bold transition-all",
                loginMode === 'admin' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Admin Login
            </button>
          </div>

          {loginMode === 'admin' ? (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  required
                  type="email"
                  placeholder="Email Address"
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  required
                  type="password"
                  placeholder="Password"
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                />
              </div>
              <button 
                type="submit"
                className="w-full py-5 bg-slate-900 text-white rounded-2xl font-bold text-xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20"
              >
                {isRegisteringAdmin ? 'Create Admin Account' : 'Sign In'}
              </button>
              <button 
                type="button"
                onClick={() => setIsRegisteringAdmin(!isRegisteringAdmin)}
                className="w-full py-2 text-slate-500 text-sm font-medium hover:text-slate-700 transition-all"
              >
                {isRegisteringAdmin ? 'Already have an account? Sign In' : 'Need to create an admin account? Register'}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePinLogin} className="space-y-6">
              <div className="flex justify-center gap-3">
                <div className="relative w-full">
                  <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
                  <input 
                    required
                    type="text"
                    placeholder="Enter your 4-digit PIN"
                    maxLength={6}
                    className="w-full pl-14 pr-4 py-6 bg-slate-50 border border-slate-100 rounded-3xl focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-center text-3xl font-black tracking-[0.5em] text-teal-600 placeholder:text-sm placeholder:tracking-normal placeholder:font-medium"
                    value={loginPin}
                    onChange={e => setLoginPin(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>
              <button 
                type="submit"
                className="w-full py-5 bg-teal-500 text-slate-900 rounded-3xl font-black text-xl hover:bg-teal-400 transition-all shadow-xl shadow-teal-500/20"
              >
                Access Dashboard
              </button>
            </form>
          )}
          
          <div className="mt-12 pt-8 border-t border-slate-100">
            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-4">Authorized Personnel</p>
            <p className="text-sm font-medium text-slate-600 mb-6">elmejor15@gmail.com</p>
            
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <p className="text-xs text-slate-500 mb-2 font-bold uppercase tracking-wider">Public Registration Link</p>
              <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200">
                <code className="text-[10px] text-teal-600 font-mono flex-1 overflow-hidden text-ellipsis">
                  {window.location.origin}/?view=register
                </code>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/?view=register`);
                    alert('Link copied to clipboard!');
                  }}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400"
                  title="Copy Link"
                >
                  <ExternalLink size={14} />
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Share this link with potential clients to register.</p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Check if user is authorized
  if (!userRole) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900 text-white p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-slate-400 mb-6">You are not authorized to access the dashboard. Please contact your administrator.</p>
          <button onClick={handleLogout} className="text-teal-400 font-bold underline">Logout</button>
        </div>
      </div>
    );
  }

  return <AdminDashboard user={user} userRole={userRole} onLogout={handleLogout} />;
}
