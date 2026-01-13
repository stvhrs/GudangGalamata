// ================================
// FILE: src/pages/buku/components/BukuForm.jsx
// ================================

import React, { useState, useEffect } from 'react';
import {
    Modal,
    Form,
    Input,
    InputNumber,
    Select,
    Row,
    Col,
    message,
    Button,
    Space,
    Popconfirm,
    Upload,
    Image,
    Divider,
    Alert
} from 'antd';
import {
    UploadOutlined,
    SaveOutlined,
    CalendarOutlined,
    BookOutlined,
    BarcodeOutlined
} from '@ant-design/icons';
import { ref, update, serverTimestamp, remove } from 'firebase/database';
import { db, app } from '../../../api/firebase';
import {
    getStorage,
    ref as storageRef,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from 'firebase/storage';

const { Option } = Select;
const storage = getStorage(app);

// URL Placeholder agar tampilan tidak kosong
const PLACEHOLDER_IMG = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQmVq-OmHL5H_5P8b1k306pFddOe3049-il2A&s";

const BukuForm = ({ open, onCancel, initialValues, bukuList = [] }) => {
    const [form] = Form.useForm();
    const isEditing = !!initialValues;

    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [fileToUpload, setFileToUpload] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const [existingImageUrl, setExistingImageUrl] = useState(null);

    // === 1. LOGIC GENERATE NEXT ID ===
    const generateNextId = () => {
        if (!bukuList || bukuList.length === 0) return "1000";

        // Ambil angka saja untuk increment
        const numericIds = bukuList
            .map(b => parseInt(b.id, 10))
            .filter(num => !isNaN(num));

        if (numericIds.length === 0) return "1000";

        const maxId = Math.max(...numericIds);
        return String(maxId + 1);
    };

    // === 2. VALIDATOR DUPLIKAT ID (PENTING) ===
    const validateKodeBuku = (_, value) => {
        if (!value) return Promise.resolve(); 

        // Ubah input ke string agar aman membandingkan "3092" vs 3092
        const inputId = String(value).trim();
        
        // Cek apakah ID sudah ada di list buku
        const exists = bukuList.some(b => String(b.id) === inputId);

        if (isEditing) {
            // MODE EDIT: 
            // Error jika ID sudah ada DAN ID tersebut milik buku lain (bukan buku yang sedang diedit)
            if (exists && String(initialValues.id) !== inputId) {
                return Promise.reject(new Error(`Kode ${inputId} sudah dipakai buku lain!`));
            }
        } else {
            // MODE CREATE: 
            // Error jika ID sudah ada di database
            if (exists) {
                return Promise.reject(new Error(`Gagal! Kode ${inputId} sudah terdaftar.`));
            }
        }
        return Promise.resolve(); // Lolos validasi
    };

    useEffect(() => {
        if (!open) return;

        if (isEditing) {
            form.setFieldsValue({
                ...initialValues,
                harga: initialValues.harga || 0,
                diskon: initialValues.diskon || 0,
                tahun: initialValues.tahun || ""
            });
            setExistingImageUrl(initialValues.coverBukuUrl || null);
            setPreviewImage(initialValues.coverBukuUrl || null);
        } else {
            form.resetFields();
            const nextId = generateNextId();
            form.setFieldsValue({
                id: nextId,
                stok: 0
            });
            setPreviewImage(null);
            setExistingImageUrl(null);
        }

        setFileToUpload(null);
    }, [open, isEditing, initialValues, form, bukuList]);

    const handlePreviewChange = (file) => {
        const valid = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
        if (!valid) {
            message.error('Hanya JPG / PNG / WEBP');
            return Upload.LIST_IGNORE;
        }
        const reader = new FileReader();
        reader.onload = () => setPreviewImage(reader.result);
        reader.readAsDataURL(file);
        setFileToUpload(file);
        return false;
    };

    const handleRemoveImage = () => {
        setFileToUpload(null);
        setPreviewImage(isEditing ? existingImageUrl : null);
    };

    const uploadImage = async (file, bookId) => {
        const fileRef = storageRef(storage, `bukuCovers/${bookId}/${file.name}`);
        const result = await uploadBytes(fileRef, file);
        const url = await getDownloadURL(result.ref);
        return { url, path: result.ref.fullPath };
    };

    const handleSubmit = async (values) => {
        // Form.useForm() otomatis memblokir eksekusi ini jika validator 'id' gagal.
        
        setLoading(true);
        try {
            const { upload, ...data } = values;
            const now = serverTimestamp();

            const hargaFixed = Number(data.harga) || 0;
            const diskonFixed = Number(data.diskon) || 0;
            const stokFixed = 0; 
            const bookId = String(data.id).trim();

            if (isEditing) {
                // === EDIT ===
                const isIdChanged = String(initialValues.id) !== bookId;
                
                let imgData = {};
                if (fileToUpload) {
                    const res = await uploadImage(fileToUpload, bookId);
                    imgData = { coverBukuUrl: res.url, coverBukuPath: res.path };
                }

                const updatePayload = {
                    ...data,
                    id: bookId,
                    harga: hargaFixed,
                    diskon: diskonFixed,
                    updatedAt: now,
                    ...imgData
                };

                if (isIdChanged) {
                    await update(ref(db, `products/${bookId}`), updatePayload);
                    await remove(ref(db, `products/${initialValues.id}`));
                    message.success(`ID dipindah: ${initialValues.id} -> ${bookId}`);
                } else {
                    await update(ref(db, `products/${initialValues.id}`), updatePayload);
                    message.success('Data diperbarui');
                }

            } else {
                // === CREATE ===
                let imgData = {};
                if (fileToUpload) {
                    const res = await uploadImage(fileToUpload, bookId);
                    imgData = { coverBukuUrl: res.url, coverBukuPath: res.path };
                }

                await update(ref(db, `products/${bookId}`), {
                    id: bookId,
                    ...data,
                    stok: stokFixed,
                    harga: hargaFixed,
                    diskon: diskonFixed,
                    createdAt: now,
                    updatedAt: now,
                    ...imgData
                });
                message.success(`Buku ditambahkan: ${bookId}`);
            }

            onCancel();
        } catch (e) {
            console.error("Submit Error:", e);
            message.error(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        setDeleting(true);
        try {
            await remove(ref(db, `products/${initialValues.id}`));
            if (initialValues.coverBukuPath) {
                try {
                    await deleteObject(storageRef(storage, initialValues.coverBukuPath));
                } catch (err) {
                    console.warn("Gagal hapus gambar:", err);
                }
            }
            message.success('Buku dihapus');
            onCancel();
        } catch (e) {
            message.error("Gagal hapus: " + e.message);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Modal
            style={{ top: 20 }}
            open={open}
            onCancel={onCancel}
            footer={null}
            width={920}
            destroyOnClose
            title={
                <Space>
                    <BookOutlined />
                    <span className="font-semibold">
                        {isEditing ? `Edit Buku: ${initialValues.nama}` : 'Tambah Buku Baru'}
                    </span>
                </Space>
            }
        >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>

                <Row gutter={24}>
                    <Col md={7} xs={24}>
                        <div className="border rounded-lg p-3 bg-gray-50">
                            <Image
                                src={previewImage || existingImageUrl || PLACEHOLDER_IMG}
                                fallback={PLACEHOLDER_IMG}
                                style={{ width: '100%', height: 220, objectFit: 'contain', backgroundColor: '#e5e7eb' }}
                            />
                            <Divider />
                            <Upload 
                                beforeUpload={handlePreviewChange} 
                                showUploadList={false}
                                accept="image/*" 
                            >
                                <Button icon={<UploadOutlined />} block>
                                    Upload Cover
                                </Button>
                            </Upload>
                            {(previewImage || existingImageUrl) && (
                                <Button danger type="text" block onClick={handleRemoveImage}>
                                    Hapus Cover
                                </Button>
                            )}
                        </div>
                    </Col>

                    <Col md={17} xs={24}>
                        {!isEditing && (
                            <Alert 
                                message="Kode Buku dibuat otomatis (Auto-Increment), namun tetap dapat diubah manual." 
                                type="info" 
                                showIcon 
                                style={{ marginBottom: 16 }}
                            />
                        )}

                        <Row gutter={16}>
                            {/* === KODE BUKU DENGAN VALIDASI ERROR === */}
                            <Col span={24}>
                                <Form.Item
                                    name="id"
                                    label="Kode Buku (ID)"
                                    hasFeedback // Menampilkan icon silang merah saat error
                                    validateFirst // Cek required dulu, baru cek duplikat
                                    rules={[
                                        { required: true, message: 'Kode Buku wajib diisi' },
                                        { pattern: /^[0-9]+$/, message: 'Disarankan hanya angka' },
                                        { validator: validateKodeBuku } // <--- LOGIKA ERROR ADA DI SINI
                                    ]}
                                    extra="Digunakan sebagai ID Database & Barcode"
                                >
                                    <Input 
                                        prefix={<BarcodeOutlined />} 
                                        placeholder="Scan barcode atau input manual" 
                                        style={{ fontWeight: 'bold', color: '#1677ff' }}
                                    />
                                </Form.Item>
                            </Col>

                            <Col span={24}>
                                <Form.Item
                                    name="nama"
                                    label="Judul Buku"
                                    rules={[{ required: true }]}
                                    extra="Judul lengkap sesuai cover"
                                >
                                    <Input placeholder="Contoh: Matematika Kelas 10" />
                                </Form.Item>
                            </Col>

                            <Col sm={12} xs={24}>
                                <Form.Item
                                    name="penerbit"
                                    label="Penerbit"
                                    rules={[{ required: true }]}
                                >
                                    <Input />
                                </Form.Item>
                            </Col>

                            <Col sm={12} xs={24}>
                                <Form.Item
                                    name="tahun"
                                    label="Tahun Terbit"
                                >
                                    <Input prefix={<CalendarOutlined />} />
                                </Form.Item>
                            </Col>

                            <Col sm={12} xs={24}>
                                <Form.Item
                                    name="harga"
                                    label="Harga Jual (Rp)"
                                    rules={[{ required: true }]}
                                >
                                    <InputNumber
                                        style={{ width: '100%' }}
                                        formatter={value => `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                        parser={value => value.replace(/Rp\s?|(,*)/g, '')}
                                        className="font-semibold"
                                    />
                                </Form.Item>
                            </Col>

                            <Col sm={12} xs={24}>
                                <Form.Item
                                    name="diskon"
                                    label="Diskon (%)"
                                    rules={[{ required: true }]}
                                >
                                    <InputNumber
                                        style={{ width: '100%' }}
                                        min={0}
                                        max={100}
                                        formatter={v => `${v}%`}
                                        parser={v => v.replace('%', '')}
                                    />
                                </Form.Item>
                            </Col>

                            <Col sm={8} xs={12}>
                                <Form.Item name="jenjang" label="Jenjang">
                                    <Select placeholder="Pilih">
                                        {['SD', 'SMP', 'SMA', 'SMK', 'UMUM'].map(i => (
                                            <Option key={i} value={i}>{i}</Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Col>

                            <Col sm={8} xs={12}>
                                <Form.Item name="kelas" label="Kelas">
                                    <InputNumber style={{ width: '100%' }} />
                                </Form.Item>
                            </Col>

                            <Col sm={8} xs={24}>
                                <Form.Item name="mapel" label="Mata Pelajaran">
                                    <Input />
                                </Form.Item>
                            </Col>

                            <Col sm={8} xs={12}>
                                <Form.Item name="tipe_buku" label="Tipe Buku">
                                    <Select placeholder="Pilih Tipe">
                                        {['BTP', 'UMUM', 'LKS', 'MODUL', 'JURNAL', 'BTU'].map(t => (
                                            <Option key={t} value={t}>{t}</Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Col>

                            <Col sm={8} xs={12}>
                                <Form.Item name="spek_kertas" label="Jenis Kertas">
                                    <Input />
                                </Form.Item>
                            </Col>

                            <Col sm={8} xs={24}>
                                <Form.Item name="peruntukan" label="Peruntukan">
                                    <Select placeholder="Pilih">
                                        {['SISWA', 'GURU', 'UMUM'].map(p => (
                                            <Option key={p} value={p}>{p}</Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            </Col>
                        </Row>
                    </Col>
                </Row>

                <Divider />
                <Row justify="space-between" align="middle">
                    <Col>
                        {isEditing && (
                            <Popconfirm title="Hapus buku ini?" onConfirm={handleDelete}>
                                <Button danger ghost loading={deleting}>
                                    Hapus Buku
                                </Button>
                            </Popconfirm>
                        )}
                    </Col>
                    <Col>
                        <Space>
                            <Button onClick={onCancel}>Batal</Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                icon={<SaveOutlined />}
                                loading={loading}
                            >
                                Simpan
                            </Button>
                        </Space>
                    </Col>
                </Row>

            </Form>
        </Modal>
    );
};

export default BukuForm;