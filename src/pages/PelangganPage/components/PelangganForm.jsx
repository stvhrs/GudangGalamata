// src/pages/pelanggan/components/PelangganForm.jsx
import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Button, message, Spin, Space } from 'antd';
import { db } from '../../../api/firebase';
import { ref, set } from 'firebase/database'; // Kita pakai set() saja cukup

export default function PelangganForm({
    open,
    onCancel,
    onSuccess,
    initialData = null,
    pelangganList
}) {
    const [form] = Form.useForm();
    const [isSaving, setIsSaving] = useState(false);
    const isEditMode = !!initialData;

    useEffect(() => {
        if (isEditMode && initialData) {
            form.setFieldsValue({
                nama: initialData.nama || '',
                telepon: initialData.telepon || '',
            });
        } else {
            form.resetFields();
        }
    }, [initialData, form, isEditMode, open]);

    const handleFinish = async (values) => {
        setIsSaving(true);
        message.loading({ content: 'Menyimpan data pelanggan...', key: 'save_pelanggan' });

        try {
            // 1. Normalisasi Data
            const namaRaw = values.nama || '';
            const namaClean = namaRaw.trim().toUpperCase(); // Pastikan UPPERCASE
            const teleponClean = values.telepon?.trim() || '';

            if (!namaClean) throw new Error("Nama pelanggan tidak boleh kosong.");

            // 2. Cek Duplikat (Validasi nama/telepon yang sama agar tidak double input)
            // Mengecualikan diri sendiri jika sedang mode edit
            const duplicateExists = pelangganList?.some(p =>
                (p.nama?.toUpperCase() === namaClean || (teleponClean && p.telepon === teleponClean)) &&
                (!isEditMode || p.id !== initialData.id)
            );

            if (duplicateExists) {
                throw new Error("Nama atau nomor telepon pelanggan sudah terdaftar.");
            }

            // 3. GENERATE ID & TIME
            let customerId;
            let createdAt;

            if (isEditMode) {
                // Jika edit, pakai ID lama & tanggal buat lama
                customerId = initialData.id;
                createdAt = initialData.createdAt || Date.now();
            } else {
                // Jika baru, Buat ID Custom: CST + NAMA + UNIQUE
                
                // Hapus spasi/simbol dari nama untuk ID (misal: "CV. ABADI" -> "CVABADI")
                const nameForId = namaClean.replace(/[^a-zA-Z0-9]/g, ""); 
                // Generate string unik pendek dari timestamp (base36)
                const uniquePart = Date.now().toString(36).toUpperCase();
                
                customerId = `CST${nameForId}${uniquePart}`;
                createdAt = Date.now();
            }

            // 4. Payload Data
            const dataToSave = {
                id: customerId, // Simpan ID di dalam object juga (best practice)
                nama: namaClean,
                telepon: teleponClean,
                createdAt: createdAt,
                updatedAt: Date.now()
            };

            // 5. Simpan ke Firebase (Path: customers/{id})
            await set(ref(db, `customers/${customerId}`), dataToSave);

            message.success({ content: isEditMode ? 'Data diperbarui' : 'Customer berhasil ditambahkan', key: 'save_pelanggan' });
            
            form.resetFields();
            onSuccess(); // Tutup modal & refresh parent jika perlu

        } catch (error) {
            console.error("Error saving pelanggan:", error);
            message.error({ content: `Gagal menyimpan: ${error.message}`, key: 'save_pelanggan' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
style={{ top: 20 }}
            title={isEditMode ? 'Edit Customer' : 'Tambah Customer Baru'}
            open={open}
            onCancel={onCancel}
            footer={null}
            destroyOnClose
            maskClosable={false}
        >
            <Spin spinning={isSaving}>
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleFinish}
                >
                    <Form.Item
                        name="nama"
                        label="Nama Customer"
                        // Auto Uppercase saat diketik
                        normalize={(value) => (value || '').toUpperCase()} 
                        rules={[
                            { required: true, message: 'Nama wajib diisi' },
                            { whitespace: true, message: 'Nama tidak boleh kosong' }
                        ]}
                    >
                        <Input placeholder="MASUKKAN NAMA LENGKAP" />
                    </Form.Item>

                    <Form.Item
                        name="telepon"
                        label="Nomor Telepon"
                        rules={[
                            { pattern: /^[0-9+-\s()]*$/, message: 'Format telepon tidak valid (hanya angka & simbol)' }
                        ]}
                    >
                        <Input placeholder="Contoh: 08123456789" />
                    </Form.Item>

                    <div style={{ textAlign: 'right', marginTop: 24 }}>
                        <Space>
                            <Button onClick={onCancel} disabled={isSaving}>
                                Batal
                            </Button>
                            <Button type="primary" htmlType="submit" loading={isSaving}>
                                {isEditMode ? 'Simpan' : 'Tambah'}
                            </Button>
                        </Space>
                    </div>
                </Form>
            </Spin>
        </Modal>
    );
}