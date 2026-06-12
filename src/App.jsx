import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Trash2, Edit2, Image as ImageIcon, CheckCircle2, Circle, CheckSquare, Square, AlignLeft, List, Check, FolderPlus, Loader2 } from 'lucide-react';

// --- Firebase のインポートと初期化 ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

// 実行環境から提供される設定を読み込む
let firebaseConfig = {};
try {
  if (typeof __firebase_config !== 'undefined') {
    firebaseConfig = JSON.parse(__firebase_config);
  }
} catch (e) {
  console.error("Firebase config parsing error", e);
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

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
      resolve(canvas.toDataURL('image/jpeg', 0.7)); // 品質を70%に圧縮
    };
    img.src = dataUrl;
  });
};

export default function App() {
  // --- 認証・データステート ---
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- アプリのステート ---
  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState('');
  const [notes, setNotes] = useState([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');

  // モーダル・フォーム管理
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [formData, setFormData] = useState({ title: '', categoryId: '', blocks: [] });
  const fileInputRef = useRef(null);

  // ドラッグ＆ドロップ管理
  const [draggedNoteId, setDraggedNoteId] = useState(null);
  const [dragOverNoteId, setDragOverNoteId] = useState(null);

  // ==========================================
  // Firebase の初期化とデータ同期 (useEffect)
  // ==========================================

  // 1. 認証（ログイン）処理
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. クラウドデータベースとの同期
  useEffect(() => {
    if (!user) {
      setCategories([]);
      setNotes([]);
      return;
    }

    const categoriesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'categories');
    const notesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notes');

    let isInitialCategoryLoad = true;

    // カテゴリーの同期
    const unsubCategories = onSnapshot(categoriesRef, (snapshot) => {
      const loadedCategories = snapshot.docs.map(d => d.data()).sort((a, b) => a.createdAt - b.createdAt);
      
      // 初回起動時、カテゴリーが1つもなければ自動作成する
      if (loadedCategories.length === 0 && isInitialCategoryLoad) {
        const defaultId = generateId();
        setDoc(doc(categoriesRef, defaultId), {
          id: defaultId,
          name: 'メインボード',
          createdAt: Date.now()
        });
      } else {
        setCategories(loadedCategories);
        setActiveCategoryId(prev => loadedCategories.find(c => c.id === prev) ? prev : loadedCategories[0]?.id);
      }
      isInitialCategoryLoad = false;
    }, (error) => console.error(error));

    // メモの同期
    const unsubNotes = onSnapshot(notesRef, (snapshot) => {
      const loadedNotes = snapshot.docs.map(d => d.data()).sort((a, b) => a.order - b.order);
      setNotes(loadedNotes);
      setLoading(false); // データ読み込み完了
    }, (error) => console.error(error));

    return () => {
      unsubCategories();
      unsubNotes();
    };
  }, [user]);

  // Firestoreドキュメントの参照ヘルパー
  const getCategoryDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'categories', id);
  const getNoteDoc = (id) => doc(db, 'artifacts', appId, 'users', user.uid, 'notes', id);

  // ==========================================
  // クラウド同期対応の各操作アクション
  // ==========================================

  // --- カテゴリー操作 ---
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

  // --- メモ操作 ---
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
    e.preventDefault();
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
        order: Date.now() // 新規追加は一番後ろにする
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
      // 楽観的UI更新（すぐに切り替える）
      setNotes(notes.map(n => n.id === id ? { ...n, isCompleted: !n.isCompleted } : n));
      // クラウド同期
      await setDoc(getNoteDoc(id), { isCompleted: !note.isCompleted }, { merge: true });
    }
  };

  const handleBoardBlockCheckToggle = async (e, noteId, blockId) => {
    e.stopPropagation();
    if (!user) return;
    const note = notes.find(n => n.id === noteId);
    if (note) {
      const newBlocks = note.blocks.map(b => b.id === blockId ? { ...b, checked: !b.checked } : b);
      setNotes(notes.map(n => n.id === noteId ? { ...n, blocks: newBlocks } : n)); // 楽観的更新
      await setDoc(getNoteDoc(noteId), { blocks: newBlocks }, { merge: true }); // クラウド同期
    }
  };

  // --- ドラッグ＆ドロップ処理（並び替え） ---
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
    const el = document.getElementById(`note-${id}`);
    if (el) el.classList.remove('opacity-40');
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    if (dragOverNoteId !== id && draggedNoteId !== id) {
      setDragOverNoteId(id);
    }
  };

  const handleDragLeave = (e, id) => {
    if (dragOverNoteId === id) setDragOverNoteId(null);
  };

  const handleDrop = async (e, targetId) => {
    e.preventDefault();
    setDragOverNoteId(null);
    const sourceId = e.dataTransfer.getData('noteId');
    if (!sourceId || sourceId === targetId || !user) return;

    const categoryNotes = notes.filter(n => n.categoryId === activeCategoryId).sort((a,b) => a.order - b.order);
    const sourceIndex = categoryNotes.findIndex(n => n.id === sourceId);
    const targetIndex = categoryNotes.findIndex(n => n.id === targetId);
    
    if (sourceIndex === -1 || targetIndex === -1) return;

    // 配列の並び替え
    const newCategoryNotes = [...categoryNotes];
    const [removed] = newCategoryNotes.splice(sourceIndex, 1);
    newCategoryNotes.splice(targetIndex, 0, removed);

    // 新しい順序番号（order）を割り当てる
    const updatedNotes = newCategoryNotes.map((note, index) => ({
      ...note,
      order: index * 1000 // 隙間を空けて保存（計算を簡略化するため）
    }));

    // 楽観的UI更新（画面上はすぐに並び替える）
    setNotes(prev => {
      const otherNotes = prev.filter(n => n.categoryId !== activeCategoryId);
      return [...otherNotes, ...updatedNotes];
    });

    // 全ての変更をクラウドに保存
    for (const note of updatedNotes) {
      await setDoc(getNoteDoc(note.id), { order: note.order }, { merge: true });
    }
  };

  // --- ブロックエディタ・画像関連 ---
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

  const handleTextareaResize = (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const handleKeyDown = (e, index, blockType) => {
    if (e.nativeEvent.isComposing) return;
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
    if (e.key === 'Backspace' && formData.blocks[index].content === '') {
      e.preventDefault();
      removeBlock(formData.blocks[index].id);
      if (index > 0) document.getElementById(`block-input-${formData.blocks[index - 1].id}`)?.focus();
    }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const compressedUrl = await compressImage(reader.result); // クラウド保存用に圧縮
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
          const compressedUrl = await compressImage(reader.result); // クラウド保存用に圧縮
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


  // データ読み込み中の表示
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
        <p className="font-medium">クラウドと同期中...</p>
      </div>
    );
  }

  const activeNotes = notes.filter(n => 
    n.categoryId === activeCategoryId && (showCompleted ? true : !n.isCompleted)
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans flex flex-col">
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 20px; }
      `}} />

      {/* ヘッダー＆タブ */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            Kanban Notes <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-1 rounded-full font-bold ml-2">Cloud Synced</span>
          </h1>
          <button
            onClick={() => openAddModal()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            新規メモ
          </button>
        </div>

        {/* カテゴリー（タブ）ナビゲーション */}
        <div className="px-6 flex items-end gap-2 overflow-x-auto custom-scrollbar pb-0">
          {categories.map(category => (
            <div
              key={category.id}
              className={`group flex items-center gap-2 px-4 py-3 border-b-2 transition-colors cursor-pointer whitespace-nowrap
                ${activeCategoryId === category.id 
                  ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }
              `}
              onClick={() => setActiveCategoryId(category.id)}
            >
              {editingCategoryId === category.id ? (
                <input
                  type="text"
                  value={editingCategoryName}
                  onChange={(e) => setEditingCategoryName(e.target.value)}
                  onBlur={() => saveCategoryName(category.id)}
                  onKeyDown={(e) => e.key === 'Enter' && saveCategoryName(category.id)}
                  autoFocus
                  className="border border-indigo-300 rounded px-2 py-0.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              ) : (
                <>
                  <span className="font-semibold text-sm">{category.name}</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setEditingCategoryId(category.id); setEditingCategoryName(category.name); }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-indigo-600 transition-opacity rounded"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  {categories.length > 1 && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-opacity rounded"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          <button
            onClick={handleAddCategory}
            className="flex items-center gap-1 px-4 py-3 text-slate-500 hover:text-indigo-600 border-b-2 border-transparent transition-colors font-medium text-sm whitespace-nowrap"
          >
            <FolderPlus className="w-4 h-4" />
            追加
          </button>

          {/* 完了済み表示トグル */}
          <div className="ml-auto flex items-center mb-3 pr-2 flex-shrink-0">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-500 hover:text-slate-700 transition-colors select-none">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
              <span className="font-medium">完了済みを表示</span>
            </label>
          </div>
        </div>
      </header>

      {/* メインボード（グリッド配置） */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto h-full">
          {activeNotes.length === 0 ? (
            <div 
              onClick={() => openAddModal()}
              className="text-center py-16 border-2 border-dashed border-slate-300 rounded-2xl text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors cursor-pointer max-w-lg mx-auto mt-10"
            >
              <div className="text-lg font-medium mb-2">メモがありません</div>
              <div className="text-sm">＋ ここをクリックして新しいメモを追加</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start pb-10">
              {activeNotes.map((note) => {
                const firstImageBlock = note.blocks?.find(b => b.type === 'image');
                
                return (
                  <div
                    id={`note-${note.id}`}
                    key={note.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, note.id)}
                    onDragEnd={(e) => handleDragEnd(e, note.id)}
                    onDragOver={(e) => handleDragOver(e, note.id)}
                    onDragLeave={(e) => handleDragLeave(e, note.id)}
                    onDrop={(e) => handleDrop(e, note.id)}
                    onClick={() => openEditModal(note)}
                    className={`group rounded-xl p-4 border shadow-sm transition-all cursor-pointer relative
                      ${dragOverNoteId === note.id ? 'border-indigo-500 ring-2 ring-indigo-200 scale-[1.02] z-10' : 'hover:shadow-md hover:border-indigo-400'}
                      ${note.isCompleted ? 'bg-slate-50 border-slate-200 opacity-60 hover:opacity-100' : 'bg-white border-slate-200'}
                    `}
                  >
                    {firstImageBlock && (
                      <div className="mb-3 rounded-lg overflow-hidden h-32 bg-slate-100 border border-slate-200 flex items-center justify-center opacity-90">
                        <img src={firstImageBlock.content} alt="サムネイル" className="max-w-full max-h-full object-cover" />
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className={`font-semibold leading-snug line-clamp-2 pr-6 ${note.isCompleted ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                        {note.title}
                      </h3>
                      <button
                        onClick={(e) => toggleComplete(e, note.id)}
                        className={`absolute top-3 right-3 transition-colors p-1 rounded-full shadow-sm border z-10
                          ${note.isCompleted ? 'text-green-500 bg-green-50 border-green-200 hover:bg-green-100' : 'text-slate-300 bg-white border-slate-100 hover:text-green-500 hover:border-green-300'}`}
                        title={note.isCompleted ? "未完了に戻す" : "完了にする"}
                      >
                        {note.isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                      </button>
                    </div>

                    <div className="relative overflow-hidden max-h-48 rounded-b-lg">
                      <div className="space-y-0.5 text-[15px] pb-6">
                        {note.blocks?.map(block => (
                          <div key={block.id}>
                            {block.type === 'text' && <div className={`whitespace-pre-wrap leading-relaxed ${note.isCompleted ? 'text-slate-400' : 'text-slate-600'}`}>{block.content}</div>}
                            {block.type === 'list' && (
                              <div className={`flex items-start gap-1.5 leading-relaxed ${note.isCompleted ? 'text-slate-400' : 'text-slate-700'}`}>
                                <span className="text-slate-400 font-bold mt-0.5">•</span>
                                <span>{block.content}</span>
                              </div>
                            )}
                            {block.type === 'checkbox' && (
                              <div 
                                className="flex items-start gap-2 cursor-pointer group/check leading-relaxed" 
                                onClick={(e) => handleBoardBlockCheckToggle(e, note.id, block.id)}
                              >
                                {block.checked 
                                  ? <CheckCircle2 className="w-4 h-4 text-indigo-500 mt-1 flex-shrink-0 group-hover/check:opacity-70" /> 
                                  : <Circle className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0 group-hover/check:text-indigo-400" />
                                }
                                <span className={`${block.checked || note.isCompleted ? 'line-through text-slate-400' : 'text-slate-700'} leading-snug`}>
                                  {block.content}
                                </span>
                              </div>
                            )}
                            {block.type === 'image' && !firstImageBlock && (
                              <div className="text-xs text-slate-400 flex items-center gap-1 my-1">
                                <ImageIcon className="w-3 h-3"/> 画像
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className={`absolute bottom-0 left-0 right-0 h-10 pointer-events-none ${note.isCompleted ? 'bg-gradient-to-t from-slate-50 to-transparent' : 'bg-gradient-to-t from-white to-transparent'}`}></div>
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl shrink-0">
              <h2 className="text-lg font-bold text-slate-800">
                {editingNote ? 'メモを編集' : '新しいメモ'}
              </h2>
              <div className="flex items-center gap-2">
                {editingNote && (
                  <button type="button" onClick={() => deleteNote(editingNote.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors" title="削除">
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-200 p-2 rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <form onSubmit={saveNote} className="flex-1 overflow-hidden flex flex-col">
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar flex flex-col">
                <div className="space-y-6 flex-1">
                  <div>
                    <input type="text" required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full px-2 py-2 text-2xl font-bold text-slate-800 border-b-2 border-transparent hover:border-slate-200 focus:border-indigo-500 outline-none transition-colors bg-transparent placeholder:text-slate-300" placeholder="タイトルを入力..." />
                  </div>

                  <div className="flex gap-4">
                    <div className="flex-1 max-w-xs">
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">カテゴリー</label>
                      <select value={formData.categoryId} onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm">
                        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 relative">
                    <div className="space-y-0 pb-10">
                      {formData.blocks?.map((block, index) => (
                        <div key={block.id} className="flex gap-2 items-start group">
                          <div className="w-6 flex justify-center mt-1 flex-shrink-0">
                            {block.type === 'list' && <div className="text-slate-400 font-bold">•</div>}
                            {block.type === 'checkbox' && (
                              <div className="cursor-pointer" onClick={() => updateBlock(block.id, { checked: !block.checked })}>
                                {block.checked ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5 text-slate-300 hover:text-indigo-300" />}
                              </div>
                            )}
                          </div>
                          
                          <div className="flex-1">
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
                                className={`w-full bg-transparent resize-none outline-none py-1 min-h-[28px] overflow-hidden leading-relaxed
                                  ${block.type === 'checkbox' && block.checked ? 'text-slate-400 line-through' : 'text-slate-700'} text-[15px]`}
                                rows={1}
                                placeholder={block.type === 'text' ? "テキストを入力するか、画像をペースト..." : "項目を入力..."}
                              />
                            )}
                          </div>

                          <button type="button" onClick={() => removeBlock(block.id)} className="opacity-0 group-hover:opacity-100 mt-1 p-1 text-slate-300 hover:text-red-500 rounded transition-opacity" title="このブロックを削除">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="sticky bottom-0 bg-white/90 backdrop-blur-sm py-3 border-t border-slate-100 flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 uppercase mr-2">追加</span>
                      <button type="button" onClick={() => addBlock('text')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"><AlignLeft className="w-4 h-4" /> テキスト</button>
                      <button type="button" onClick={() => addBlock('list')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"><List className="w-4 h-4" /> リスト</button>
                      <button type="button" onClick={() => addBlock('checkbox')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"><CheckSquare className="w-4 h-4" /> チェック</button>
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"><ImageIcon className="w-4 h-4" /> 画像</button>
                      <input type="file" ref={fileInputRef} onChange={handleImageSelect} accept="image/*" className="hidden" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 rounded-b-2xl shrink-0">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors">キャンセル</button>
                <button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition-colors shadow-sm flex items-center gap-2">
                  <Check className="w-4 h-4" /> 保存する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}