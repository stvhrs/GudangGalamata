import React, { useState, useEffect, useRef } from 'react';
import {
    Modal, Form, Input, InputNumber, DatePicker, Upload, Button,
    Typography, message, List, Checkbox, Row, Col, Empty, Alert, Tag, Spin
} from 'antd';
import { DeleteOutlined, SaveOutlined, SearchOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';

// IMPORT FIREBASE
import { db, storage } from '../../../api/firebase'; 
import { 
    ref, update, get, query, orderByChild, 
    limitToLast, onValue, startAt, endAt
} from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

const { Text } = Typography;

// --- KONFIGURASI ---
const FIXED_KATEGORI = 'Penjualan Buku';
const FIXED_TIPE = 'pemasukan';

const currencyFormatter = (value) => 
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

// FORMAT ID AMAN: PP-TAHUN-BULAN-ACAK
const generateTransactionId = () => {
    const year = dayjs().format('YYYY');
    const month = dayjs().format('MM');
    const uniquePart = Math.floor(1000 + Math.random() * 9000); 
    return `PP-${year}${month}-${uniquePart}`; 
};

// Helper Base64
const getBase64 = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
    });

const PembayaranForm = ({ open, onCancel, initialValues }) => {
    const [form] = Form.useForm();
    const [modal, contextHolder] = Modal.useModal();
    
    // --- STATE ---
    const [searchText, setSearchText] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    
    const [fileList, setFileList] = useState([]);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState('');
    const [previewTitle, setPreviewTitle] = useState('');
    
    const [invoiceList, setInvoiceList] = useState([]); 
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]); 
    const [paymentAllocations, setPaymentAllocations] = useState({});
    
    const [isSearching, setIsSearching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // --- 1. MANUAL DEBOUNCE ---
    useEffect(() => {
        if (initialValues) return; 
        const timer = setTimeout(() => {
            setDebouncedSearch(searchText);
        }, 500); 
        return () => clearTimeout(timer);
    }, [searchText, initialValues]);

    // --- HELPER SORTING KUAT (Safe Sort) ---
    // Fungsi ini memastikan data terurut dari Terbaru ke Terlama
    // Apapun format tanggalnya (Timestamp angka atau String 'YYYY-MM-DD')
    const sortNewestFirst = (list) => {
        return list.sort((a, b) => {
            // Konversi ke timestamp angka agar bisa dikurangi
            const dateA = dayjs(a.tanggal).valueOf();
            const dateB = dayjs(b.tanggal).valueOf();
            
            // Jika tanggal beda, urutkan tanggal (Besar ke Kecil)
            if (dateB !== dateA) return dateB - dateA;
            
            // Jika tanggal sama persis, urutkan by ID (sebagai fallback)
            return b.id.localeCompare(a.id); 
        });
    };

    // --- 2. DATA FETCHING ---
    useEffect(() => {
        if (!open || initialValues) return;

        setIsSearching(true);
        const dbRef = ref(db, 'transaksiJualBuku');

        // A. KONDISI DEFAULT (PENCARIAN KOSONG)
        if (!debouncedSearch) {
            // Ambil 50 data terakhir berdasarkan Tanggal
            // Note: Firebase mengembalikan data Ascending (Lama -> Baru)
            const q = query(dbRef, orderByChild('tanggal'), limitToLast(50));

            const unsubscribe = onValue(q, (snapshot) => {
                let list = [];
                if (snapshot.exists()) {
                    snapshot.forEach(child => {
                        const val = child.val();
                        const sisa = (val.totalTagihan || 0) - (val.jumlahTerbayar || 0);
                        
                        // FILTER: Hanya tampilkan yang BELUM LUNAS
                        if (sisa > 0 && val.statusPembayaran !== 'Lunas') {
                            list.push({
                                id: child.key,
                                ...val,
                                sisaTagihan: sisa
                            });
                        }
                    });
                }

                // SORTING CLIENT SIDE (Membalik urutan Firebase)
                const sortedList = sortNewestFirst(list);

                setInvoiceList(sortedList);
                setIsSearching(false);
            }, (error) => {
                console.error("Error stream:", error);
                setIsSearching(false);
            });

            return () => unsubscribe();
        } 
        
        // B. KONDISI PENCARIAN AKTIF
        else {
            const keyword = debouncedSearch.toUpperCase();
            
            const doSearch = async () => {
                try {
                    const [snapName, snapInv] = await Promise.all([
                        // Cari Nama Pelanggan
                        get(query(dbRef, orderByChild('namaPelanggan'), startAt(keyword), endAt(keyword + "\uf8ff"))),
                        // Cari Nomor Invoice
                        get(query(dbRef, orderByChild('nomorInvoice'), startAt(keyword), endAt(keyword + "\uf8ff")))
                    ]);

                    const combinedMap = new Map();

                    const processSnapshot = (snap) => {
                        if (snap.exists()) {
                            snap.forEach((child) => {
                                const val = child.val();
                                const sisa = (val.totalTagihan || 0) - (val.jumlahTerbayar || 0);
                                
                                // FILTER: Hanya yang BELUM LUNAS
                                if (sisa > 0 && val.statusPembayaran !== 'Lunas') {
                                    combinedMap.set(child.key, {
                                        id: child.key,
                                        ...val,
                                        sisaTagihan: sisa
                                    });
                                }
                            });
                        }
                    };

                    processSnapshot(snapName);
                    processSnapshot(snapInv);

                    let list = Array.from(combinedMap.values());
                    
                    // SORTING
                    const sortedList = sortNewestFirst(list);

                    setInvoiceList(sortedList);
                } catch (err) {
                    console.error("Search error", err);
                } finally {
                    setIsSearching(false);
                }
            };

            doSearch();
        }
    }, [open, debouncedSearch, initialValues]);

    // --- 3. INITIALIZATION (Edit / Reset) ---
    useEffect(() => {
        if (!open) {
            resetFormState();
        } else {
            setIsSaving(false);

            if (initialValues) {
                // MODE EDIT
                const currentJumlah = Math.abs(initialValues.jumlahBayar || initialValues.jumlah || 0);

                form.setFieldsValue({
                    ...initialValues,
                    tanggal: initialValues.tanggal ? dayjs(initialValues.tanggal) : dayjs(),
                    jumlahTotal: currentJumlah,
                });

                if (initialValues.idTransaksi) {
                    const ids = Array.isArray(initialValues.idTransaksi) ? initialValues.idTransaksi : [initialValues.idTransaksi];
                    setSelectedInvoiceIds(ids);

                    const alloc = {};
                    ids.forEach(id => { alloc[id] = currentJumlah; }); 
                    setPaymentAllocations(alloc);

                    // Fetch Khusus Edit (Ambil data spesifik meski LUNAS)
                    setIsSearching(true);
                    const fetchSpecificInvoices = async () => {
                        try {
                            const promises = ids.map(id => get(ref(db, `transaksiJualBuku/${id}`)));
                            const snapshots = await Promise.all(promises);
                            let specificList = [];
                            snapshots.forEach(snap => {
                                if (snap.exists()) {
                                    const val = snap.val();
                                    specificList.push({
                                        id: snap.key,
                                        ...val,
                                        sisaTagihan: (val.totalTagihan || 0) - (val.jumlahTerbayar || 0)
                                    });
                                }
                            });
                            // Tetap sort saat edit
                            setInvoiceList(sortNewestFirst(specificList)); 
                        } catch (err) { console.error(err); } 
                        finally { setIsSearching(false); }
                    };
                    fetchSpecificInvoices();
                }

                if (initialValues.buktiUrl) {
                    setFileList([{ uid: '-1', name: 'Bukti', status: 'done', url: initialValues.buktiUrl }]);
                }
            } else {
                // MODE BARU
                form.resetFields();
                form.setFieldsValue({ tanggal: dayjs(), jumlahTotal: 0 });
            }
        }
    }, [initialValues, open, form]);

    const resetFormState = () => {
        form.resetFields();
        setFileList([]);
        setPreviewImage('');
        setSelectedInvoiceIds([]);
        setInvoiceList([]); 
        setPaymentAllocations({});
        setSearchText('');
        setDebouncedSearch('');
        setIsSearching(false);
    };

    // --- HANDLERS ---
    const handleCancelPreview = () => setPreviewOpen(false);
    const handlePreview = async (file) => {
        if (!file.url && !file.preview) file.preview = await getBase64(file.originFileObj);
        setPreviewImage(file.url || file.preview);
        setPreviewOpen(true);
        setPreviewTitle(file.name || file.url.substring(file.url.lastIndexOf('/') + 1));
    };
    
    const handleSearchInput = (e) => setSearchText(e.target.value.toUpperCase());

    const calculateTotal = (allocations) => {
        const total = Object.values(allocations).reduce((a, b) => a + (b || 0), 0);
        form.setFieldsValue({ jumlahTotal: total });
    };

    const handleNominalChange = (val, recordId) => {
        const newAllocations = { ...paymentAllocations, [recordId]: val };
        setPaymentAllocations(newAllocations);
        calculateTotal(newAllocations);
    };

    const toggleSelection = (id, sisaTagihan) => {
        let newSelected = [...selectedInvoiceIds];
        const newAllocations = { ...paymentAllocations };

        if (newSelected.includes(id)) {
            newSelected = newSelected.filter(itemId => itemId !== id);
            delete newAllocations[id];
        } else {
            newSelected.push(id);
            // Default isi nominal dengan sisa tagihan
            newAllocations[id] = sisaTagihan > 0 ? sisaTagihan : 0;
        }

        setSelectedInvoiceIds(newSelected);
        setPaymentAllocations(newAllocations);
        calculateTotal(newAllocations);

        if (newSelected.length > 0) {
            const currentInvoice = invoiceList.find(item => item.id === id);
            const currentKeterangan = form.getFieldValue('keterangan');
            if (currentInvoice && (!currentKeterangan || currentKeterangan.trim() === '')) {
                form.setFieldsValue({ keterangan: `Pembayaran ${currentInvoice.namaPelanggan}` });
            }
        }
    };

    // --- SIMPAN ---
    const handleSave = async (values) => {
        if (selectedInvoiceIds.length === 0) {
            message.error("Pilih minimal satu invoice!");
            return;
        }
        setIsSaving(true);
        message.loading({ content: 'Menyimpan...', key: 'saving' });
        
        try {
            let buktiUrl = initialValues?.buktiUrl || null;
            const buktiFile = (fileList.length > 0 && fileList[0].originFileObj) ? fileList[0].originFileObj : null;
            if (fileList.length === 0 && initialValues?.buktiUrl) buktiUrl = null;

            if (buktiFile) {
                const safeName = (values.keterangan || 'bukti').substring(0, 10).replace(/[^a-z0-9]/gi, '_');
                const fileRef = storageRef(storage, `bukti_pembayaran/${safeName}-${uuidv4()}`);
                await uploadBytes(fileRef, buktiFile);
                buktiUrl = await getDownloadURL(fileRef);
            }

            const updates = {};
            const timestampNow = dayjs(values.tanggal).valueOf();

            for (const invId of selectedInvoiceIds) {
                const amount = paymentAllocations[invId];
                if (!amount || amount <= 0) continue; 

                const isSingleEdit = initialValues && selectedInvoiceIds.length === 1 && initialValues.idTransaksi === invId;
                const mutasiId = isSingleEdit ? initialValues.id : generateTransactionId();

                const invSnap = await get(ref(db, `transaksiJualBuku/${invId}`));
                if (!invSnap.exists()) continue;
                
                const dbInv = invSnap.val();
                let basePaid = Number(dbInv.jumlahTerbayar || 0);
                
                if (isSingleEdit) {
                    const oldAmount = initialValues.jumlah || 0;
                    basePaid -= oldAmount;
                }

                const newTotalPaid = basePaid + amount;
                const newStatus = newTotalPaid >= (dbInv.totalTagihan || 0) ? 'Lunas' : 'Belum';

                // 1. Update Invoice
                updates[`transaksiJualBuku/${invId}/jumlahTerbayar`] = newTotalPaid;
                updates[`transaksiJualBuku/${invId}/statusPembayaran`] = newStatus;
                updates[`transaksiJualBuku/${invId}/updatedAt`] = { ".sv": "timestamp" };

                // 2. Riwayat Invoice
                const defaultKeterangan = values.keterangan || `Pembayaran ${dbInv.namaPelanggan}`;
                updates[`transaksiJualBuku/${invId}/riwayatPembayaran/${mutasiId}`] = { 
                    tanggal: timestampNow, 
                    jumlah: amount, 
                    mutasiId: mutasiId, 
                    keterangan: defaultKeterangan
                };

                // 3. Mutasi
                const dataMutasi = {
                    id: mutasiId,
                    tipe: FIXED_TIPE, 
                    kategori: FIXED_KATEGORI, 
                    tanggal: timestampNow,
                    jumlah: amount, 
                    keterangan: defaultKeterangan,
                    buktiUrl: buktiUrl,
                    idTransaksi: invId, 
                    namaPelanggan: dbInv.namaPelanggan || 'Umum',
                    nomorInvoice: dbInv.nomorInvoice, 
                    detailAlokasi: {
                        [invId]: { amount: amount, noInvoice: dbInv.nomorInvoice }
                    },
                    index_kategori_tanggal: `Penjualan Buku_${timestampNow}`,
                    nomorBuktiDisplay: mutasiId.replace(/-/g, '/') 
                };

                updates[`mutasi/${mutasiId}`] = dataMutasi;
                updates[`historiPembayaran/${mutasiId}`] = dataMutasi;
            }

            await update(ref(db), updates);
            message.success({ content: 'Disimpan!', key: 'saving' });
            onCancel();
        } catch (error) {
            console.error("Gagal Simpan:", error);
            message.error({ content: `Gagal: ${error.message}`, key: 'saving' });
        } finally {
            setIsSaving(false);
        }
    };

    // --- HAPUS ---
    const handleDelete = () => {
        modal.confirm({
            title: 'Hapus Pembayaran?',
            content: 'Saldo invoice akan dikembalikan ke tagihan. Yakin?',
            okText: 'Hapus',
            okType: 'danger',
            onOk: async () => {
                setIsSaving(true);
                try {
                    const mutasiId = initialValues.id;
                    const updates = {};
                    
                    updates[`mutasi/${mutasiId}`] = null; 
                    updates[`historiPembayaran/${mutasiId}`] = null;

                    let allocations = initialValues.detailAlokasi;
                    
                    if (!allocations && initialValues.idTransaksi) {
                        const ids = Array.isArray(initialValues.idTransaksi) ? initialValues.idTransaksi : [initialValues.idTransaksi];
                        allocations = {};
                        ids.forEach(id => {
                            allocations[id] = { amount: initialValues.jumlah || 0 };
                        });
                    }

                    if (allocations) {
                        for (const [invId, val] of Object.entries(allocations)) {
                            const amountToDelete = typeof val === 'object' ? val.amount : val;
                            const invSnap = await get(ref(db, `transaksiJualBuku/${invId}`));
                            
                            if (invSnap.exists()) {
                                const invData = invSnap.val();
                                const currentPaid = Number(invData.jumlahTerbayar || 0);
                                const newPaid = currentPaid - Number(amountToDelete);
                                const finalPaid = newPaid < 0 ? 0 : newPaid; 
                                
                                const newStatus = finalPaid >= (invData.totalTagihan || 0) ? 'Lunas' : 'Belum';

                                updates[`transaksiJualBuku/${invId}/jumlahTerbayar`] = finalPaid;
                                updates[`transaksiJualBuku/${invId}/statusPembayaran`] = newStatus;
                                updates[`transaksiJualBuku/${invId}/riwayatPembayaran/${mutasiId}`] = null;
                            }
                        }
                    }

                    await update(ref(db), updates);
                    message.success('Pembayaran dihapus.');
                    onCancel();
                } catch (error) {
                    console.error("Gagal Hapus:", error);
                    message.error("Gagal hapus: " + error.message);
                } finally {
                    setIsSaving(false);
                }
            }
        });
    };

    return (
        <>
            {contextHolder}
            <Modal
                open={open}
                title={initialValues ? "Edit Pembayaran" : "Input Pembayaran Baru"}
                onCancel={onCancel}
                width={700}
                maskClosable={false}
                footer={[
                    initialValues && <Button key="del" danger icon={<DeleteOutlined />} onClick={handleDelete}>Hapus</Button>,
                    <Button key="back" onClick={onCancel} disabled={isSaving}>Batal</Button>,
                    <Button key="submit" type="primary" loading={isSaving} icon={<SaveOutlined />} onClick={() => form.submit()}>
                        Simpan
                    </Button>
                ]}
            >
                <Form form={form} layout="vertical" onFinish={handleSave}>
                    
                    {initialValues ? (
                        <Alert message="Mode Edit" description="Pencarian dinonaktifkan." type="warning" showIcon style={{marginBottom: 16}} />
                    ) : (
                        <Alert message="Pilih Invoice" description="Cari nama pelanggan atau nomor invoice, lalu centang kotak di kanan." type="info" showIcon style={{marginBottom: 16}} />
                    )}

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item name="tanggal" label="Tanggal" rules={[{ required: true }]}>
                                <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="jumlahTotal" label="Total Nominal">
                                <InputNumber 
                                    style={{ width: '100%', fontWeight: 'bold' }} 
                                    formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} 
                                    readOnly prefix="Rp"
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <div style={{ marginBottom: 12 }}>
                        <Input 
                            placeholder="Cari Pelanggan / No Invoice..." 
                            prefix={<SearchOutlined />} 
                            value={searchText}
                            onChange={handleSearchInput}
                            allowClear
                            disabled={!!initialValues} 
                        />
                    </div>

                    <div style={{ 
                        maxHeight: '350px', 
                        overflowY: 'auto', 
                        border: '1px solid #f0f0f0', 
                        borderRadius: 8, 
                        marginBottom: 16,
                        backgroundColor: '#fafafa'
                    }}>
                        {invoiceList.length === 0 && !isSearching && (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Tidak ada tagihan tertunggak" style={{margin: '20px 0'}} />
                        )}
                        
                        <List
                            dataSource={invoiceList}
                            loading={isSearching}
                            renderItem={(item) => {
                                const isSelected = selectedInvoiceIds.includes(item.id);
                                const hasDebt = item.sisaTagihan > 0;
                                return (
                                    <List.Item style={{ padding: '10px 15px', background: isSelected ? '#e6f7ff' : '#fff', borderBottom: '1px solid #f0f0f0' }}>
                                        <div style={{ width: '100%' }}>
                                            <Row align="middle" gutter={8}>
                                                <Col flex="auto">
                                                    {/* [FIX] Text Nama Pelanggan jadi Hitam (Default Antd) */}
                                                    <div style={{ fontWeight: 'bold', color: 'rgba(0, 0, 0, 0.88)' }}>
                                                        {item.namaPelanggan}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: '#888' }}>
                                                        {item.nomorInvoice} • {dayjs(item.tanggal).format('DD MMM YY')}
                                                    </div>
                                                    <div style={{ fontSize: 12 }}>
                                                        Sisa: <Text type={hasDebt ? "danger" : "secondary"}>{currencyFormatter(item.sisaTagihan)}</Text>
                                                    </div>
                                                </Col>
                                                
                                                <Col>
                                                    {isSelected ? (
                                                        <InputNumber 
                                                            value={paymentAllocations[item.id]} 
                                                            onChange={(v) => handleNominalChange(v, item.id)}
                                                            formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} 
                                                            parser={v => v.replace(/[^\d]/g, '')} 
                                                            min={0}
                                                            style={{ width: 130 }}
                                                            placeholder="Nominal"
                                                        />
                                                    ) : (
                                                        <Tag color={hasDebt ? "red" : "green"}>
                                                            {hasDebt ? "BELUM LUNAS" : "LUNAS"}
                                                        </Tag>
                                                    )}
                                                </Col>

                                                <Col>
                                                    <Checkbox 
                                                        checked={isSelected}
                                                        onChange={() => toggleSelection(item.id, item.sisaTagihan)}
                                                        disabled={!!initialValues && !isSelected} 
                                                    />
                                                </Col>
                                            </Row>
                                        </div>
                                    </List.Item>
                                );
                            }}
                        />
                    </div>

                    <Form.Item name="keterangan" label="Catatan">
                        <Input.TextArea rows={1} placeholder="Contoh: Pembayaran Lunas" />
                    </Form.Item>
                    
                    <Form.Item name="bukti" label="Bukti Transfer">
                        <Upload 
                            accept="image/*" listType="picture-card" maxCount={1} 
                            fileList={fileList} onPreview={(file) => {
                                setPreviewImage(file.url || file.preview);
                                setPreviewOpen(true);
                            }}
                            onChange={({ fileList }) => setFileList(fileList)}
                            beforeUpload={(file) => {
                                if (!file.type.startsWith('image/')) return Upload.LIST_IGNORE;
                                return false; 
                            }}
                        >
                            {fileList.length < 1 && <div><PlusOutlined /><div style={{marginTop: 8}}>Upload</div></div>}
                        </Upload>
                    </Form.Item>
                </Form>
            </Modal>

            <Modal open={previewOpen} footer={null} onCancel={() => setPreviewOpen(false)}>
                <img alt="bukti" style={{ width: '100%' }} src={previewImage} />
            </Modal>
        </>
    );
};

export default PembayaranForm;