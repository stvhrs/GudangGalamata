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
    Divider
} from 'antd';
import {
    UploadOutlined,
    SaveOutlined,
    CalendarOutlined,
    BookOutlined
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

const BukuForm = ({ open, onCancel, initialValues }) => {
    const [form] = Form.useForm();
    const isEditing = !!initialValues;

    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [fileToUpload, setFileToUpload] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const [existingImageUrl, setExistingImageUrl] = useState(null);

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
            // === MODIFIKASI: RESET TOTAL SAAT CREATE (TIDAK ADA INITIAL VALUE) ===
            form.resetFields();
            
            // Mengosongkan state gambar
            setPreviewImage(null);
            setExistingImageUrl(null);
        }

        setFileToUpload(null);
    }, [open, isEditing, initialValues, form]);

    const generateCustomId = (nama, penerbit, tahun) => {
        // 1. Ambil Huruf Pertama Judul (Default 'X' jika kosong)
        const char1 = nama ? nama.trim().charAt(0).toUpperCase() : 'X';
        
        // 2. Ambil Huruf Pertama Penerbit (Default 'X' jika kosong)
        const char2 = penerbit ? penerbit.trim().charAt(0).toUpperCase() : 'X';
        
        // 3. Ambil Digit Terakhir Tahun (Default '0' jika kosong)
        const char3 = tahun ? String(tahun).trim().slice(-1) : '0';
        
        // 4. Generate 2 Karakter Random (Angka/Huruf)
        const random2 = Math.random().toString(36).substring(2, 4).toUpperCase();

        // Gabung -> Total 5 Karakter
        return `${char1}${char2}${char3}${random2}`;
    };

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
        // Jika edit, kembalikan ke gambar lama jika ada, jika tidak null
        setPreviewImage(isEditing ? existingImageUrl : null);
    };

    const uploadImage = async (file, bookId) => {
        const fileRef = storageRef(storage, `bukuCovers/${bookId}/${file.name}`);
        const result = await uploadBytes(fileRef, file);
        const url = await getDownloadURL(result.ref);
        return { url, path: result.ref.fullPath };
    };

    const handleSubmit = async (values) => {
        setLoading(true);
        try {
            const { upload, ...data } = values;
            const now = serverTimestamp();

            // Pastikan angka valid (default 0 jika undefined saat submit)
            const hargaFixed = Number(data.harga) || 0;
            const diskonFixed = Number(data.diskon) || 0;
            
            const stokFixed = 0; 

            if (isEditing) {
                // === EDIT ===
                let imgData = {};
                if (fileToUpload) {
                    const res = await uploadImage(fileToUpload, initialValues.id);
                    imgData = { coverBukuUrl: res.url, coverBukuPath: res.path };
                }

                await update(ref(db, `products/${initialValues.id}`), {
                    ...data,
                    harga: hargaFixed,
                    diskon: diskonFixed,
                    updatedAt: now,
                    ...imgData
                });
                message.success('products diperbarui');
            } else {
                // === CREATE ===
                const bookId = generateCustomId(data.penerbit, data.nama, data.tahun);
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
                message.success('products ditambahkan');
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
            message.success('products dihapus');
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
            style={{ top: 24 }}
            width={920}
            destroyOnClose
            title={
                <Space>
                    <BookOutlined />
                    <span className="font-semibold">
                        {isEditing ? 'Edit Buku' : 'Tambah Buku'}
                    </span>
                </Space>
            }
        >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>

                {/* ================= COVER ================= */}
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

                    {/* ================= FORM ================= */}
                    <Col md={17} xs={24}>
                        <Row gutter={16}>
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
                                    extra="Nama penerbit buku"
                                >
                                    <Input />
                                </Form.Item>
                            </Col>

                            <Col sm={12} xs={24}>
                                <Form.Item
                                    name="tahun"
                                    label="Tahun Terbit"
                                    extra="Contoh: 2024"
                                >
                                    <Input prefix={<CalendarOutlined />} />
                                </Form.Item>
                            </Col>

                            <Col sm={12} xs={24}>
                                <Form.Item
                                    name="harga"
                                    label="Harga Jual (Rp)"
                                    rules={[{ required: true }]}
                                    extra="Harga jual per buku"
                                >
                                    <InputNumber
                                        style={{ width: '100%' }}
                                        formatter={value =>
                                            `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                        }
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
                                    extra="Diskon dalam persen"
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

                            {/* === DETAIL LAINNYA === */}
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
                                    {/* === MODIFIKASI: UPDATE LIST TIPE BUKU === */}
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

                {/* ================= FOOTER ================= */}
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