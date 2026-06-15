import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Trash2, Edit2, Image as ImageIcon, CheckCircle2, Circle, CheckSquare, Square, AlignLeft, List, Check, FolderPlus, Loader2, AlertCircle, LogOut } from 'lucide-react';

// --- Firebase のインポートと初期化 ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// ▼▼▼ ここをご自身のFirebase設定に書き換えてください ▼▼▼
let firebaseConfig = {
  apiKey: "AIzaSyCqTZxvNFGf0O4_DDa7JQ45Zd8hxYKqYHY",
  authDomain: "kanban-cloud-app.firebaseapp.com",
  projectId: "kanban-cloud-app",
  storageBucket: "kanban-cloud-app.firebasestorage.app",
  messagingSenderId: "584318556014",
  appId: "1:584318556014:web:426b5fbfb962b730a7137f"
};
// ▲▲▲ ここまで ▲▲▲

// Canvas環境（プレビュー）で動かすための自動切り替え処理
try {
  if (typeof __firebase_config !== 'undefined') {
    firebaseConfig = JSON.parse(__firebase_config);
  }
} catch (e) {
  console.error("Firebase config parsing error", e);
}

const appId = typeof __app_id !== 'undefined' ? __app_id : 'kanban-cloud-app';
const isConfigValid = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";

const app = isConfigValid ? initializeApp(firebaseConfig) : null;
const auth = isConfigValid ? getAuth(app) : null;
const provider = new GoogleAuthProvider();
const db = isConfigValid ? getFirestore(app) : null;

const generateId = () => Math.random().toString(36).substr(2, 9);

// 画像を圧縮してFirestoreの保存上限（1MB）を超えないようにする処理
const compressImage = (dataUrl) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const MAX_WIDTH = 800;
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = dataUrl;
  });
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState('');
  const [notes, setNotes] = useState([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [formData, setFormData] = useState({ title: '', categoryId: '', blocks: [] });
  const fileInputRef = useRef(null);

  const [draggedNoteId, setDraggedNoteId] = useState(null);
  const [dragOverNoteId, setDragOverNoteId] = useState(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState(null);

  // ==========================================
  // テキストエリアの高さ自動調整 & 自動スクロール
  // ==========================================
  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => {
        const textareas = document.querySelectorAll('textarea');
        textareas.forEach(t => {
          t.style.height = 'auto';
          t.style.height = `${t.scrollHeight}px`;
        });
      }, 10);
    }
  }, [isModalOpen, formData.blocks]);

  const handleTextareaResize = (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
    
    // 入力行が画面下部（保存ボタンの裏など）に隠れないよう自動スクロール
    const container = e.target.closest('.overflow-y-auto');
    if (container) {
      const rect = e.target.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      // 下部フッターの高さ＋少し余裕を持たせたピクセル値（約120px）
      const paddingBottom = 120; 
      
      if (rect.bottom > containerRect.bottom - paddingBottom) {
        container.scrollTop += (rect.bottom - (containerRect.bottom - paddingBottom));
      }
    }
  };

  // ==========================================
  // Firebase の初期化とデータ同期
  // ==========================================
  useEffect(() => {
    if (!isConfigValid) return;

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login error", error);
      if (error.code === 'auth/unauthorized-domain') {
        alert(`【ドメイン未登録エラー】\n\nセキュリティ設定によりログインがブロックされました。\nFirebase Console の「Authentication」>「設定」>「承認済みドメイン」に以下のドメインを追加してください:\n\n${window.location.hostname}`);
      } else {
        alert("ログインに失敗しました。もう一度お試しください。");
      }
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error", error);
    }
  };

  useEffect(() => {
    if (!user || !isConfigValid) {
      setCategories([]);
      setNotes([]);
      return;
    }

    const categoriesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'categories');
    const notesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notes');

    let isInitialCategoryLoad = true;

    const unsubCategories = onSnapshot(categoriesRef, (snapshot) => {
      const loadedCategories = snapshot.docs.map(d => d.data()).sort((a, b) => a.createdAt - b.createdAt);
      if (loadedCategories.length === 0 && isInitialCategoryLoad) {
        const defaultId = generateId();
        setDoc(doc(categoriesRef, defaultId), { id: defaultId, name: 'メインボード', createdAt: Date.now() });
      } else {
        setCategories(loadedCategories);
        setActiveCategoryId(prev => loadedCategories.find(c => c.id === prev) ? prev : loadedCategories[0]?.id);
      }
      isInitialCategoryLoad = false;
    }, (error) => console.error(error));

    const unsubNotes = onSnapshot(notesRef, (snapshot) => {
      const loadedNotes = snapshot.docs.map(d => d.data()).sort((a, b) => a.order - b.order);
      setNotes(loadedNotes);
      setLoading(false);
    }, (error) => console.error(error));

    return () => {
      unsubCategories();
      unsubNotes();
    };
  }, [user]);

  const getCategoryDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'categories', id);
  const getNoteDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'notes', id);

  // ==========================================
  // 操作アクション
  // ==========================================
  const handleAddCategory = async () => {
    if (!user) return;
    const newId = generateId();
    const newCategory = { id: newId, name: '新しいカテゴリー', createdAt: Date.now() };
    await setDoc(getCategoryDoc(newId), newCategory);
    setActiveCategoryId(newId);
    setEditingCategoryId(newId);
    setEditingCategoryName(newCategory.name);
  };

  const saveCategoryName = async (id) => {
    if (!user || editingCategoryName.trim() === '') return;
    await setDoc(getCategoryDoc(id), { name: editingCategoryName.trim() }, { merge: true });
    setEditingCategoryId(null);
  };

  const handleDeleteCategory = async (id) => {
    if (!user || categories.length <= 1) return;
    await deleteDoc(getCategoryDoc(id));
  };

  const openAddModal = () => {
    setEditingNote(null);
    setFormData({
      title: '',
      categoryId: activeCategoryId,
      blocks: [{ id: generateId(), type: 'text', content: '', checked: false }]
    });
    setIsModalOpen(true);
  };

  const openEditModal = (note) => {
    setEditingNote(note);
    const initialBlocks = note.blocks || [{ id: generateId(), type: 'text', content: note.content || '', checked: false }];
    setFormData({ ...note, blocks: initialBlocks });
    setIsModalOpen(true);
  };

  const saveNote = async (e) => {
    if (e) e.preventDefault();
    if (!formData.title.trim() || !user) return;

    if (editingNote) {
      await setDoc(getNoteDoc(editingNote.id), formData, { merge: true });
    } else {
      const newId = generateId();
      await setDoc(getNoteDoc(newId), {
        ...formData,
        id: newId,
        isCompleted: false,
        createdAt: Date.now(),
        order: Date.now()
      });
    }
    setIsModalOpen(false);
  };

  const deleteNote = async (id) => {
    if (!user) return;
    await deleteDoc(getNoteDoc(id));
    setIsModalOpen(false);
  };

  const toggleComplete = async (e, id) => {
    e.stopPropagation();
    if (!user) return;
    const note = notes.find(n => n.id === id);
    if (note) {
      setNotes(notes.map(n => n.id === id ? { ...n, isCompleted: !n.isCompleted } : n));
      await setDoc(getNoteDoc(id), { isCompleted: !note.isCompleted }, { merge: true });
    }
  };

  const handleBoardBlockCheckToggle = async (e, noteId, blockId) => {
    e.stopPropagation();
    if (!user) return;
    const note = notes.find(n => n.id === noteId);
    if (note) {
      const newBlocks = note.blocks.map(b => b.id === blockId ? { ...b, checked: !b.checked } : b);
      setNotes(notes.map(n => n.id === noteId ? { ...n, blocks: newBlocks } : n));
      await setDoc(getNoteDoc(noteId), { blocks: newBlocks }, { merge: true });
    }
  };

  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('noteId', id);
    setDraggedNoteId(id);
    setTimeout(() => {
      const el = document.getElementById(`note-${id}`);
      if (el) el.classList.add('opacity-40');
    }, 0);
  };

  const handleDragEnd = (e, id) => {
    setDraggedNoteId(null);
    setDragOverNoteId(null);
    setDragOverCategoryId(null);
    const el = document.getElementById(`note-${id}`);
    if (el) el.classList.remove('opacity-40');
  };

  const handleDragOverNote = (e, id) => {
    e.preventDefault();
    if (dragOverNoteId !== id && draggedNoteId !== id) setDragOverNoteId(id);
  };

  const handleDropOnNote = async (e, targetId) => {
    e.preventDefault();
    setDragOverNoteId(null);
    const sourceId = e.dataTransfer.getData('noteId');
    if (!sourceId || sourceId === targetId || !user) return;

    const categoryNotes = notes.filter(n => n.categoryId === activeCategoryId).sort((a,b) => a.order - b.order);
    const sourceIndex = categoryNotes.findIndex(n => n.id === sourceId);
    const targetIndex = categoryNotes.findIndex(n => n.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const newCategoryNotes = [...categoryNotes];
    const [removed] = newCategoryNotes.splice(sourceIndex, 1);
    newCategoryNotes.splice(targetIndex, 0, removed);

    const updatedNotes = newCategoryNotes.map((note, index) => ({
      ...note,
      order: index * 1000
    }));

    setNotes(prev => {
      const otherNotes = prev.filter(n => n.categoryId !== activeCategoryId);
      return [...otherNotes, ...updatedNotes];
    });

    for (const note of updatedNotes) {
      await setDoc(getNoteDoc(note.id), { order: note.order }, { merge: true });
    }
  };

  const handleCategoryDragOver = (e, categoryId) => {
    e.preventDefault();
    if (categoryId !== activeCategoryId) setDragOverCategoryId(categoryId);
  };

  const handleCategoryDrop = async (e, targetCategoryId) => {
    e.preventDefault();
    setDragOverCategoryId(null);
    const sourceId = e.dataTransfer.getData('noteId');
    if (!sourceId || targetCategoryId === activeCategoryId || !user) return;

    setNotes(notes.map(n => n.id === sourceId ? { ...n, categoryId: targetCategoryId, order: Date.now() } : n));
    await setDoc(getNoteDoc(sourceId), { categoryId: targetCategoryId, order: Date.now() }, { merge: true });
  };

  // --- ブロックエディタ ---
  const addBlock = (type) => {
    setFormData(prev => ({
      ...prev,
      blocks: [...prev.blocks, { id: generateId(), type, content: '', checked: false }]
    }));
  };

  const updateBlock = (blockId, updates) => {
    setFormData(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => b.id === blockId ? { ...b, ...updates } : b)
    }));
  };

  const removeBlock = (blockId) => {
    setFormData(prev => ({ ...prev, blocks: prev.blocks.filter(b => b.id !== blockId) }));
  };

  const handleKeyDown = (e, index, blockType) => {
    if (e.nativeEvent.isComposing) return;
    
    // Backspaceで空の行を削除して前の行に戻る
    if (e.key === 'Backspace' && formData.blocks[index].content === '') {
      e.preventDefault();
      if (formData.blocks.length > 1) {
        removeBlock(formData.blocks[index].id);
        if (index > 0) {
          setTimeout(() => {
            const prevInput = document.getElementById(`block-input-${formData.blocks[index - 1].id}`);
            if (prevInput) {
              prevInput.focus();
              prevInput.setSelectionRange(prevInput.value.length, prevInput.value.length);
            }
          }, 0);
        }
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (blockType === 'list' || blockType === 'checkbox') {
        e.preventDefault();
        const newBlock = { id: generateId(), type: blockType, content: '', checked: false };
        const newBlocks = [...formData.blocks];
        newBlocks.splice(index + 1, 0, newBlock);
        setFormData({ ...formData, blocks: newBlocks });
        setTimeout(() => document.getElementById(`block-input-${newBlock.id}`)?.focus(), 0);
      }
    }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressedUrl = await compressImage(reader.result);
      setFormData(prev => ({
        ...prev,
        blocks: [...prev.blocks, { id: generateId(), type: 'image', content: compressedUrl }]
      }));
    };
    reader.readAsDataURL(file);
    e.target.value = null;
  };

  const handlePaste = async (e, index) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = items[i].getAsFile();
        const reader = new FileReader();
        reader.onloadend = async () => {
          const compressedUrl = await compressImage(reader.result);
          const newBlock = { id: generateId(), type: 'image', content: compressedUrl };
          const newBlocks = [...formData.blocks];
          newBlocks.splice(index + 1, 0, newBlock);
          setFormData({ ...formData, blocks: newBlocks });
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  };

  // ==========================================
  // レンダリング
  // ==========================================
  if (!isConfigValid) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center text-slate-800 p-6">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-lg w-full">
          <div className="w-16 h-16 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4"><AlertCircle className="w-8 h-8" /></div>
          <h2 className="text-xl font-bold mb-4 text-center">Firebaseの設定が完了していません</h2>
          <div className="text-slate-600 mb-6 text-sm space-y-3 leading-relaxed">
            <p>コード内の <code>firebaseConfig</code> が <code>"YOUR_API_KEY"</code> のままになっています。</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user && !loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center text-slate-800 p-6">
        <div className="bg-white p-10 rounded-3xl shadow-xl max-w-md w-full text-center">
          <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 transform rotate-3"><CheckSquare className="w-10 h-10" /></div>
          <h1 className="text-3xl font-extrabold mb-2 text-slate-800">Kanban Notes</h1>
          <p className="text-slate-500 mb-8 font-medium">どこからでも、あなたのアイデアにアクセス。</p>
          <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 px-6 py-4 rounded-xl font-bold transition-all shadow-sm active:scale-[0.98]">
            <svg className="w-6 h-6" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Googleでログインして始める
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
        <p className="font-medium">同期中...</p>
      </div>
    );
  }

  const activeNotes = notes.filter(n => n.categoryId === activeCategoryId && (showCompleted ? true : !n.isCompleted));

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans flex flex-col">
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
      `}} />

      {/* ヘッダー */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            Kanban Notes <span className="text-[10px] sm:text-xs bg-indigo-100 text-indigo-600 px-2 py-1 rounded-full font-bold ml-1 sm:ml-2">Cloud</span>
          </h1>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:flex items-center gap-2 text-sm text-slate-500 font-medium">
              {user?.photoURL && <img src={user.photoURL} alt="User" className="w-6 h-6 rounded-full border border-slate-200" />}
              {user?.displayName || 'ユーザー'}
            </div>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><LogOut className="w-5 h-5" /></button>
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
            {/* 新規メモボタン：テキストを消してアイコンだけにスッキリと */}
            <button 
              onClick={() => openAddModal()} 
              className="flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white w-10 h-10 rounded-lg transition-colors shadow-sm"
              title="新規メモ"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* カテゴリー（タブ）ナビゲーション */}
        <div className="px-4 sm:px-6 flex items-end gap-2 overflow-x-auto custom-scrollbar pb-0">
          {categories.map(category => (
            <div
              key={category.id}
              onClick={() => setActiveCategoryId(category.id)}
              onDragOver={(e) => handleCategoryDragOver(e, category.id)}
              onDragLeave={() => setDragOverCategoryId(null)}
              onDrop={(e) => handleCategoryDrop(e, category.id)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-3 border-b-2 transition-all cursor-pointer whitespace-nowrap
                ${activeCategoryId === category.id 
                  ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' 
                  : dragOverCategoryId === category.id
                    ? 'border-indigo-400 text-indigo-600 bg-indigo-50 scale-105'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }
              `}
            >
              {editingCategoryId === category.id ? (
                <input
                  type="text"
                  value={editingCategoryName}
                  onChange={(e) => setEditingCategoryName(e.target.value)}
                  onBlur={() => saveCategoryName(category.id)}
                  onKeyDown={(e) => e.key === 'Enter' && saveCategoryName(category.id)}
                  autoFocus
                  className="border border-indigo-300 rounded px-2 py-0.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white w-24 sm:w-32"
                />
              ) : (
                <>
                  <span className="font-semibold text-sm select-none">{category.name}</span>
                  {activeCategoryId === category.id && (
                    <div className="flex items-center ml-1">
                      <button onClick={(e) => { e.stopPropagation(); setEditingCategoryId(category.id); setEditingCategoryName(category.name); }} className="p-1 text-slate-400 hover:text-indigo-600 transition-colors rounded"><Edit2 className="w-3.5 h-3.5" /></button>
                      {categories.length > 1 && (
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category.id); }} className="p-1 text-slate-400 hover:text-red-500 transition-colors rounded"><X className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          <button onClick={handleAddCategory} className="flex items-center gap-1 px-3 sm:px-4 py-3 text-slate-500 hover:text-indigo-600 border-b-2 border-transparent transition-colors font-medium text-sm whitespace-nowrap">
            <FolderPlus className="w-4 h-4" /> 追加
          </button>
          <div className="ml-auto flex items-center mb-3 pr-2 flex-shrink-0">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs sm:text-sm text-slate-500 hover:text-slate-700 transition-colors select-none">
              <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded text-indigo-600 focus:ring-indigo-500" />
              <span className="font-medium">完了を表示</span>
            </label>
          </div>
        </div>
      </header>

      {/* メインボード (スマホ縦画面で2列表示: columns-2) */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-7xl mx-auto h-full">
          {activeNotes.length === 0 ? (
            <div onClick={() => openAddModal()} className="text-center py-16 border-2 border-dashed border-slate-300 rounded-2xl text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors cursor-pointer max-w-lg mx-auto mt-10">
              <div className="text-lg font-medium mb-2">メモがありません</div>
              <div className="text-sm">＋ ここをクリックして新しいメモを追加</div>
            </div>
          ) : (
            <div className="columns-2 lg:columns-3 xl:columns-4 gap-3 sm:gap-6 pb-10">
              {activeNotes.map((note) => {
                const firstImageBlock = note.blocks?.find(b => b.type === 'image');
                return (
                  <div
                    id={`note-${note.id}`}
                    key={note.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, note.id)}
                    onDragEnd={(e) => handleDragEnd(e, note.id)}
                    onDragOver={(e) => handleDragOverNote(e, note.id)}
                    onDragLeave={() => setDragOverNoteId(null)}
                    onDrop={(e) => handleDropOnNote(e, note.id)}
                    onClick={() => openEditModal(note)}
                    className={`break-inside-avoid mb-3 sm:mb-6 group rounded-xl p-3 sm:p-4 border shadow-sm transition-all cursor-pointer relative
                      ${dragOverNoteId === note.id ? 'border-indigo-500 ring-2 ring-indigo-200 scale-[1.02] z-10' : 'hover:shadow-md hover:border-indigo-400'}
                      ${note.isCompleted ? 'bg-slate-50 border-slate-200 opacity-60 hover:opacity-100' : 'bg-white border-slate-200'}
                    `}
                  >
                    {firstImageBlock && (
                      <div className="mb-2 sm:mb-3 rounded-lg overflow-hidden h-24 sm:h-32 bg-slate-100 border border-slate-200 flex items-center justify-center opacity-90">
                        <img src={firstImageBlock.content} alt="サムネイル" className="max-w-full max-h-full object-cover" />
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-1 sm:gap-2 mb-2">
                      <h3 className={`font-semibold leading-snug line-clamp-2 pr-5 sm:pr-6 text-sm sm:text-base ${note.isCompleted ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                        {note.title}
                      </h3>
                      <button
                        onClick={(e) => toggleComplete(e, note.id)}
                        className={`absolute top-2 right-2 sm:top-3 sm:right-3 transition-colors p-0.5 sm:p-1 rounded-full shadow-sm border z-10
                          ${note.isCompleted ? 'text-green-500 bg-green-50 border-green-200 hover:bg-green-100' : 'text-slate-300 bg-white border-slate-100 hover:text-green-500 hover:border-green-300'}`}
                      >
                        {note.isCompleted ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <Circle className="w-4 h-4 sm:w-5 sm:h-5" />}
                      </button>
                    </div>

                    <div className="relative overflow-hidden max-h-96 rounded-b-lg">
                      <div className="space-y-0 text-xs sm:text-[15px] pb-6">
                        {note.blocks?.map(block => (
                          <div key={block.id} className="py-0">
                            {block.type === 'text' && <div className={`whitespace-pre-wrap leading-relaxed ${note.isCompleted ? 'text-slate-400' : 'text-slate-600'}`}>{block.content}</div>}
                            {block.type === 'list' && (
                              <div className={`flex items-start gap-1 sm:gap-1.5 leading-relaxed ${note.isCompleted ? 'text-slate-400' : 'text-slate-700'}`}>
                                <span className="text-slate-400 font-bold mt-0.5 shrink-0">•</span>
                                <span>{block.content}</span>
                              </div>
                            )}
                            {block.type === 'checkbox' && (
                              <div className="flex items-start gap-1.5 sm:gap-2 cursor-pointer group/check leading-relaxed" onClick={(e) => handleBoardBlockCheckToggle(e, note.id, block.id)}>
                                {block.checked 
                                  ? <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-500 mt-0.5 flex-shrink-0 group-hover/check:opacity-70" /> 
                                  : <Circle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 mt-0.5 flex-shrink-0 group-hover/check:text-indigo-400" />
                                }
                                <span className={`${block.checked || note.isCompleted ? 'line-through text-slate-400' : 'text-slate-700'} leading-snug`}>{block.content}</span>
                              </div>
                            )}
                            {block.type === 'image' && !firstImageBlock && <div className="text-[10px] sm:text-xs text-slate-400 flex items-center gap-1 my-1"><ImageIcon className="w-3 h-3"/> 画像</div>}
                          </div>
                        ))}
                      </div>
                      <div className={`absolute bottom-0 left-0 right-0 h-10 sm:h-12 pointer-events-none ${note.isCompleted ? 'bg-gradient-to-t from-slate-50 to-transparent' : 'bg-gradient-to-t from-white to-transparent'}`}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ノート追加・編集モーダル */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[95vh] sm:max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            
            {/* ヘッダー */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl shrink-0 gap-2 sm:gap-4">
              <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <input 
                  type="text" 
                  required 
                  value={formData.title} 
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })} 
                  className="flex-1 px-1 sm:px-2 py-1 sm:py-1.5 text-lg sm:text-xl font-bold text-slate-800 bg-transparent border-b-2 border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none transition-colors placeholder:text-slate-400" 
                  placeholder="タイトル" 
                />
                <select 
                  value={formData.categoryId} 
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })} 
                  className="w-32 sm:w-40 px-2 sm:px-3 py-1 sm:py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-xs sm:text-sm text-slate-600 shrink-0"
                >
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {editingNote && (
                  <button type="button" onClick={() => deleteNote(editingNote.id)} className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1.5 sm:p-2 rounded-lg transition-colors" title="削除">
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
                <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-200 p-1.5 sm:p-2 rounded-lg transition-colors" title="閉じる">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* エディタ部分：十分な余白と自動スクロールで快適に入力可能 */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-[50vh] custom-scrollbar flex flex-col relative">
              <div className="flex-1 relative">
                <div className="space-y-0">
                  {formData.blocks?.map((block, index) => (
                    <div key={block.id} className="flex items-start group relative">
                      
                      <div className={`flex justify-center shrink-0 ${block.type === 'text' ? 'w-1 sm:w-0' : 'w-6 sm:w-7 pt-[6px]'}`}> 
                        {block.type === 'list' && <div className="text-slate-400 font-bold text-lg">•</div>}
                        {block.type === 'checkbox' && (
                          <div className="cursor-pointer" onClick={() => updateBlock(block.id, { checked: !block.checked })}>
                            {block.checked ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5 text-slate-300 hover:text-indigo-300" />}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 pl-1 pr-6 sm:pr-8">
                        {block.type === 'image' ? (
                          <div className="relative inline-block my-2">
                            <img src={block.content} alt="添付画像" className="max-w-full h-auto rounded-lg border border-slate-200" />
                          </div>
                        ) : (
                          <textarea
                            id={`block-input-${block.id}`}
                            value={block.content}
                            onChange={(e) => { handleTextareaResize(e); updateBlock(block.id, { content: e.target.value }); }}
                            onKeyDown={(e) => handleKeyDown(e, index, block.type)}
                            onPaste={(e) => handlePaste(e, index)}
                            className={`w-full bg-transparent resize-none outline-none py-0.5 m-0 leading-relaxed overflow-hidden min-h-[28px]
                              ${block.type === 'checkbox' && block.checked ? 'text-slate-400 line-through' : 'text-slate-800'} text-sm sm:text-[15px]`}
                            rows={1}
                            placeholder={block.type === 'text' ? (index === 0 ? "ここからメモを入力..." : "") : "項目を入力..."}
                          />
                        )}
                      </div>
                      
                      {/* スマホ対策：常に薄く表示しておき、2回タップ問題を回避 */}
                      <button type="button" onClick={() => removeBlock(block.id)} className="absolute right-0 top-1 opacity-40 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-opacity" title="この行を削除">
                        <X className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* フッター */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between rounded-b-2xl shrink-0 z-10 flex-wrap gap-2 sm:gap-4 shadow-[0_-10px_15px_-3px_rgba(248,250,252,1)]">
              <div className="flex items-center gap-1 sm:gap-2">
                <button type="button" onClick={() => addBlock('text')} title="テキストを追加" className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><AlignLeft className="w-5 h-5" /></button>
                <button type="button" onClick={() => addBlock('list')} title="リストを追加" className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><List className="w-5 h-5" /></button>
                <button type="button" onClick={() => addBlock('checkbox')} title="チェックボックスを追加" className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><CheckSquare className="w-5 h-5" /></button>
                <button type="button" onClick={() => fileInputRef.current?.click()} title="画像を追加" className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><ImageIcon className="w-5 h-5" /></button>
                <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
              </div>
              <div className="flex items-center gap-2 sm:gap-3 ml-auto">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-3 py-2 sm:px-5 sm:py-2.5 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors text-xs sm:text-base">キャンセル</button>
                <button type="button" onClick={saveNote} className="px-4 py-2 sm:px-6 sm:py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition-colors shadow-sm flex items-center gap-2 text-sm sm:text-base">
                  <Check className="w-4 h-4" /> 保存する
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}